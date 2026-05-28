# syntax=docker/dockerfile:1

FROM emscripten/emsdk:5.0.7 AS base

# Download and build the f2c binary
FROM base AS f2c-builder

ADD --unpack=true \
    https://netlib.org/f2c/src.tgz /opt/f2c/build

RUN make -C /opt/f2c/build/src -f makefile.u f2c

# Download and build the f2c library
FROM base AS libf2c-builder

ADD https://netlib.org/f2c/libf2c.zip /opt/f2c/build/libf2c.zip

RUN unzip /opt/f2c/build/libf2c.zip -d /opt/f2c/build/libf2c

RUN sed -i -E 's/^(CC|CFLAGS) =/\1 ?=/' /opt/f2c/build/libf2c/makefile.u \
    && sed -i -E 's/^\t(ld|mv) /# \t\1 /' /opt/f2c/build/libf2c/makefile.u \
    && sed -i -E 's/^\tar /\t$(AR) /' /opt/f2c/build/libf2c/makefile.u \
    && sed -i -E 's/^\t-ranlib /\t$(AR) s /' /opt/f2c/build/libf2c/makefile.u \
    && echo '#define IEEE_8087' > /opt/f2c/build/libf2c/arith.h

RUN emmake make -C /opt/f2c/build/libf2c -f makefile.u \
        CFLAGS="-Wno-parentheses -Wno-shift-op-parentheses -Wno-format-security -flto -Oz" \
        all

# Convert Classic Fortran sources to C
FROM base AS classic-converter

COPY --from=f2c-builder /opt/f2c/build/src/f2c /usr/local/bin/f2c

COPY ./Classic /opt/classic/orig

RUN mkdir -p /opt/classic/src \
    && f2c -A -ec -w66 -W4 '-!bs' \
        /opt/classic/orig/src/*.f \
        -d /opt/classic/src

RUN sed -i 's/o__1.orl = /o__1.orl = 4 * /' /opt/classic/src/helper.c
RUN sed -i 's/int s_copy/void s_copy/' /opt/classic/src/helper.c

# Generate the C files that will populate the virtual filesystem with the help and demo files

FROM base AS fs-builder

COPY --from=classic-converter /opt/classic/orig /opt/classic/orig
COPY ./src/populate_fs.c /src/fs/populate_fs.c

RUN mkdir -p /opt/fs/src

RUN echo 'static const char * name = "mathelp.idx";' > /opt/fs/src/populate_fs_mathelp_idx.c \
    && echo 'static const char data[] = {' >> /opt/fs/src/populate_fs_mathelp_idx.c \
    && cat /opt/classic/orig/mathelp.idx | od -An -vt x1 | sed -E 's/ (..)/ 0x\1,/g' >> /opt/fs/src/populate_fs_mathelp_idx.c \
    && echo '};' >> /opt/fs/src/populate_fs_mathelp_idx.c \
    && cat /src/fs/populate_fs.c >> /opt/fs/src/populate_fs_mathelp_idx.c

RUN echo 'static const char * name = "mathelp.dac";' > /opt/fs/src/populate_fs_mathelp_dac.c \
    && echo 'static const char data[] = {' >> /opt/fs/src/populate_fs_mathelp_dac.c \
    && cat /opt/classic/orig/mathelp.dac | od -An -vt x1 | sed -E 's/ (..)/ 0x\1,/g' >> /opt/fs/src/populate_fs_mathelp_dac.c \
    && echo '};' >> /opt/fs/src/populate_fs_mathelp_dac.c \
    && cat /src/fs/populate_fs.c >> /opt/fs/src/populate_fs_mathelp_dac.c

RUN echo 'static const char * name = "demo";' > /opt/fs/src/populate_fs_demo.c \
    && echo 'static const char data[] = {' >> /opt/fs/src/populate_fs_demo.c \
    && sed -E 's/\r$$//g' /opt/classic/orig/demo | od -An -vt x1 | sed -E 's/ (..)/ 0x\1,/g' >> /opt/fs/src/populate_fs_demo.c \
    && echo '};' >> /opt/fs/src/populate_fs_demo.c \
    && cat /src/fs/populate_fs.c >> /opt/fs/src/populate_fs_demo.c

# Build Classic from the converted sources

FROM base AS classic-builder

COPY --from=libf2c-builder /opt/f2c/build/libf2c/libf2c.a /opt/f2c/lib/libf2c.a
COPY --from=libf2c-builder /opt/f2c/build/libf2c/f2c.h /opt/f2c/include/f2c.h
COPY --from=classic-converter /opt/classic/src /opt/classic/src
COPY --from=fs-builder /opt/fs/src /opt/fs/src

RUN mkdir -p /opt/classic/build

RUN emcc -I/opt/f2c/include -L/opt/f2c/lib \
        /opt/classic/src/*.c \
        /opt/fs/src/*.c \
        -lf2c \
        -flto \
        -Oz \
        -sWASMFS \
        -o /opt/classic/build/classic.wasm

# Build readline

FROM base AS readline-builder

COPY ./readline /opt/readline

RUN emcc /opt/readline/*.c \
        -flto \
        -Oz \
        -sWASMFS \
        -o /opt/readline/build/readline.wasm

# Build the frontend with Vite
FROM node:22-slim AS vite-builder

WORKDIR /app

COPY package.json index.html vite.config.js /app/
COPY src /app/src
COPY --from=classic-builder /opt/classic/build/classic.wasm /app/src/classic.wasm

RUN npm install
RUN npx vite build

# Build the final image
FROM scratch AS final
COPY --from=vite-builder /app/build /
