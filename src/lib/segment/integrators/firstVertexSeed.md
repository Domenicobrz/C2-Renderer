the initial camera ray should be the same of the pixel we are shading,
to make sure we'll always hit the same surface point x1, and avoid
running the risk of one of the random replays to get a camera ray that lands
on an x1 with an invalid gbuffer. This solution will fix, among many, also this problem in particular:
if the canonical pixel is at the edge between a refractive surface and a simple diffuse one.
if the other candidates are on the diffuse surface, the canonical candidate will very easily
be shiftable into the other candidates, thus the canonical mi from GBH will be low
however, the other candidates might be unable to be shifted into the canonical's pixel domain,
since half of those pixels would end up on the glass surface, thus having no contribution.
in pratice this would result in less radiance gathered at the edges of this interface

### Here's the reason why we also need a firstVertexSeed memeber:

Imagine at tap #1 of spatial-reuse to have a canonical seed (3778628608) and that we're on the edge between a glass surface and a diffuse surface behind it.
Our canonical sample may have landed on the glass surface. All of the candidates we'll be testing will be shifted onto that pixel. We'll make sure the camera starts at the same first vertex each time we make a shift, by reusing the canonical candidate's seed.
After spatial reuse at tap #1, imagine we end up with a new seed (979639232) that was picked at the end of the spatial-reuse procedure. For tap #2, now we could find this problem:
Our new pick (979639232) has a first vertex that doesn't land on the glass surface anymore! because the first vertex sampled by that seed could land on the wall/diffuse surface instead of the glass one we had sampled previously.
The easy fix is to keep the original first-vertex-seed around during spatial reuse, so that every tap will correctly set the initial first vertex.

Another option could have been in theory to try and shift the candidates preemptively into the pixel and see if they land on a similiar gBuffer. This check would happen when selecting candidates before starting the spatial-resample routine. If they don't land on a similiar gbuffer, I wouldn't be able to use them. However this adds 3 (or even 6 when using 6 candidates, as recommended by the paper) ray-bvh traversals PER TAP. (so 18 additional bounces in total for 3 taps at 6 candidates each) -- this would have been more expensive for no additional benefit, so we went with the option of having another struct member called "firstVertexSeed"
