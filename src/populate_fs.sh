#!/bin/bash
FILE=$1
NAME=$(basename $FILE)
echo 'static const char * name = "'$NAME'";'
echo 'static const char data[] = {'
cat $FILE | sed -E 's/\r$$//g' | od -An -vt x1 | sed -E 's/ (..)/ 0x\1,/g'
echo '};'

cat <<EOF

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
EOF