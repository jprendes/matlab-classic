// static const char * name = "filename.txt";
// static const char data[] = {1, 2, 3};

#include <stdio.h>
#include <unistd.h>

__attribute__((constructor)) static void populate_fs() {
    FILE * f = fopen(name, "wb");
    fwrite(data, 1, sizeof(data), f);
    fclose(f);
}

__attribute__((destructor)) static void cleanup_fs() {
    unlink(name);
}
