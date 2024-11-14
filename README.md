# C2-Renderer

A simple webgpu renderer implemented with javascript and svelte

[Web demo](https://domenicobrz.github.io/webgl/projects/c2-renderer/)

### Main features

1. Anisotropic Torrance-Sparrow BRDFs for conductors and dielectrics
2. Multi-scattering energy compensation LUTs for conductors and dielectrics
3. Beer-lambert volume absorption for dielectric materials
4. Simple Lambertian BRDF
5. Multiple importance sampling with either one-sample model (OSM) or next-event estimation (NEE)
6. Support for bump maps, albedo and roughness textures
7. Importance-sampled environment-maps with PiecewiseConstant2D constructs from pbrt v4, including switch between standard and compensated distributions
8. Camera model with support for tilt-shift and cat-eyed bokeh effects
9. Normal-view and camera-light previews
10. HDR envmap to PC2D conversion and export
11. Uniform and Halton sequence samplers, with optional pixel-correlation fix

<img src="screenshots/1.png" width="90%" />
<img src="screenshots/3.png" width="90%" />
<img src="screenshots/2.png" width="90%" />
