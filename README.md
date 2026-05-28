# MATLAB Classic (1984 Edition)
The 1984 edition of MATLAB running in web page using WebAssembly.

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
npx http-server ./build -p 8080
```
Then on a browser open `http://localhost:8080`.