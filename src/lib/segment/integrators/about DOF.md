DOF won't work in ReSTIR PT since we lose the assumptions of gBuffers closely matching the properties of the underlying pixel surface.
Also the technique used to pin down the initial vertex, using "firstVertexSeed" is also unuseable
with DOF / large apertures.

Even if we were to commit to the change of removing gBuffer tests and discarding candidates only after actually
testing where they land, and remove completely our reliance on gBuffer, the results would likely still be quite bad
since ReSTIR-PT with large apertures wouldn't be able to easily find useable pixels, like described in
[this paper](https://research.nvidia.com/labs/rtr/publication/zhang2024area/zhang2024area.pdf)

We should instead try to support [Area ReSTIR](https://research.nvidia.com/labs/rtr/publication/zhang2024area/zhang2024area.pdf) in case it's really important to have a fully working implementation of ReSTIR-PT
