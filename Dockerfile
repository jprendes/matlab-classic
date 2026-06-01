# syntax=docker/dockerfile:1

FROM emscripten/emsdk:5.0.7 AS base

ENV CFLAGS="-Oz -flto"
#ENV CFLAGS="-O0 -g"
ENV F2CFLAGS="-A -ec -w66 -W4 -!bs"

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
        CFLAGS="-Wno-parentheses -Wno-shift-op-parentheses -Wno-format-security $CFLAGS" \
        all

FROM base AS development

COPY --from=f2c-builder /opt/f2c/build/src/f2c /usr/local/bin/f2c
COPY --from=libf2c-builder /opt/f2c/build/libf2c/libf2c.a /opt/f2c/lib/libf2c.a
COPY --from=libf2c-builder /opt/f2c/build/libf2c/f2c.h /opt/f2c/include/f2c.h
COPY ./src/populate_fs.sh /usr/local/bin/populate_fs

# Convert MATLAB '84 Fortran sources to C (from local Classic folder)
FROM development AS matlab84-converter

COPY ./matlab84 /matlab

RUN f2c $F2CFLAGS \
        /matlab/src/*.f \
        -d /src

RUN sed -i 's/o__1.orl = /o__1.orl = 4 * /' /src/helper.c
RUN sed -i 's/int s_copy/void s_copy/' /src/helper.c

RUN populate_fs /matlab/mathelp.idx > /src/populate_fs_mathelp.idx.c
RUN populate_fs /matlab/mathelp.dac > /src/populate_fs_mathelp.dac.c
RUN populate_fs /matlab/demo > /src/populate_fs_demo.c

# Convert MATLAB '82 Fortran sources to C (from GitHub johnsonjh/matlab)
FROM development AS matlab82-converter

COPY ./matlab82 /matlab
COPY ./patches /patches
COPY ./demo /matlab/

RUN find /matlab/SRC -type f -name "*.FOR" -exec sh -c 'mv "$0" "${0%.FOR}.f"' {} \;
RUN rm /matlab/SRC/S.f
RUN find /matlab -type f \( -name "*.f" -o -name "*.HLP" \) -exec sed -i -e 's/\r$//' -e 's/\x1a$/\n/' {} \;
RUN cd /matlab && patch -p1 < /patches/matlab82-patch-io.patch
RUN cd /matlab && patch -p1 < /patches/matlab82-patch-more-elements.patch
RUN cd /matlab && patch -p1 < /patches/matlab82-patch-fix-help.patch
RUN cd /matlab && patch -p1 < /patches/matlab82-patch-fix-print.patch
RUN f2c $F2CFLAGS \
        /matlab/SRC/*.f \
        -d /src

RUN mv /matlab/BIN/MATLAB.HLP /matlab/BIN/matlab.hlp
RUN populate_fs /matlab/BIN/matlab.hlp > /src/populate_fs_matlab.hlp.c
RUN populate_fs /matlab/demo > /src/populate_fs_demo.c

# Build MATLAB from the converted sources

FROM development AS matlab-builder

# Choose MATLAB version (comment out one):
#COPY --from=matlab84-converter /src /src
COPY --from=matlab82-converter /src /src

RUN mkdir /build
RUN emcc -I/opt/f2c/include -L/opt/f2c/lib \
        /src/*.c \
        -lf2c \
        $CFLAGS \
        -sWASMFS \
        -o /build/classic.wasm

# Build the frontend with Vite
FROM node:22-alpine AS vite-builder

WORKDIR /app

COPY package.json /app/
RUN npm install

COPY index.html vite.config.js /app/
COPY src /app/src
COPY --from=matlab-builder /build/classic.wasm /app/src/classic.wasm

RUN npx vite build

# Build the final image
FROM scratch AS final
COPY --from=vite-builder /app/build /
