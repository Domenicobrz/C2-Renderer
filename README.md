# C2-Renderer

A simple webgpu renderer implemented with javascript and svelte

### Main features

1. Anisotropic Torrance-Sparrow BRDFs for both conductor and dielectrics
2. Beer-lambert volume absorption for dielectric materials
3. Simple Lambertian BRDF
4. Multiple importance sampling with either one-sample model (OSM) or next-event estimation (NEE)
5. Support for bump maps, albedo and roughness textures
6. Importance-sampled environment-maps with PiecewiseConstant2D constructs from pbrt v4, including switch between standard and compensated distributions
7. Camera model with support for tilt-shift and cat-eyed bokeh effects
8. Normal-view and camera-light previews
9. HDR envmap to PC2D conversion and export

<img src="screenshots/1.png" width="90%" />
<img src="screenshots/2.png" width="90%" />
