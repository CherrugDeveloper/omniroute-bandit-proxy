#!/bin/bash
# This script squashes commits from the second one onward
sed -i '2,$s/^pick /squash /' "$1"