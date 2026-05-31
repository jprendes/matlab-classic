# MATLAB Classic (1982 Edition)
The 1982 edition of MATLAB running in a web page using WebAssembly.

**Try it live:** https://jprendes.github.io/matlab-classic/

The original MATLAB 82 source code is included as a git submodule from [johnsonjh/matlab](https://github.com/johnsonjh/matlab).

# Build
To build the project you need a liinux host, an internet connection and docker.
Then run from a terminal
```
docker build . --output ./build
```
The generated files are located in `./build/`.

# Run
The generated files need to be served with an http server.
To do this, run from a terminal
```
docker run --rm -it \
    -v $PWD:/app \
    -p 8080:8080 \
    node:22-alpine \
    node /app/src/server.mjs /app/build
```
Then on a browser open `http://localhost:8080`.