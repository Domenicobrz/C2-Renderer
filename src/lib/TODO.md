At the moment all materials structs are being created from materialsData each time a
material is found, is this the best approach? Can we do better or is this way
of doing things ok?

Rewrite the Triangle.idxRef logic such that it's not required to save the idxRef prop

colors are using 1 byte per channel, this is likely wrong / problematic

implement part 2 of:
https://schuttejoe.github.io/post/ggximportancesamplingpart1/
