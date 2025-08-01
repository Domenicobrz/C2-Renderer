# C2-Renderer

A simple webgpu renderer implemented with javascript and svelte

[Web demo](https://domenicobrz.github.io/webgl/projects/c2-renderer/)

### Main features

1. Anisotropic Torrance-Sparrow BRDFs for conductors and dielectrics
2. Multi-scattering energy compensation LUTs for conductors and dielectrics
3. Beer-lambert volume absorption for dielectric materials
4. Simple Lambertian BRDF and Energy-preserving Oren Nayar diffuse BRDF model
5. Multiple importance sampling with either one-sample model (OSM) or next-event estimation (NEE)
6. Support for bump maps, albedo and roughness textures
7. Importance-sampled environment-maps with PiecewiseConstant2D constructs from pbrt v4, including switch between standard and compensated distributions
8. Camera model with support for tilt-shift and cat-eyed bokeh effects
9. Normal-view and camera-light previews
10. HDR envmap to PC2D conversion and export
11. Different types of samplers: Uniform, Halton, Blue noise and a customized "sequenced" version of the R2 sampler
12. 3 types of pixel-decorrelation strategies (none, random offset, blue noise mask)
13. Two types of integrator: a simple backward path tracer and ReSTIR-PT
14. ReSTIR-PT supports 3 types of generalized balance heuristic, Pairwise MIS (defensive variant) / complete GBH / Biased GBH
15. ReSTIR-PT also supports variable spatio-temporal filter sizes, pass & reuse candidates count

<img src="screenshots/1.png" width="90%" />
<img src="screenshots/3.png" width="90%" />
<img src="screenshots/2.png" width="90%" />

### C2 implements research from:

1. [EON: A practical energy-preserving rough diffuse BRDF](https://arxiv.org/pdf/2410.18026)
2. [Practical multiple scattering compensation for microfacet models](https://blog.selfshadow.com/publications/turquin/ms_comp_final.pdf)
3. [R2 Low discrepancy sequence](https://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/)
4. [Blue-noise Dithered Sampling](https://blogs.autodesk.com/media-and-entertainment/wp-content/uploads/sites/162/dither_abstract.pdf)
5. [Multiple importance sampling](https://graphics.stanford.edu/courses/cs348b-03/papers/veach-chapter9.pdf)
6. [ReSTIR-DI](https://research.nvidia.com/sites/default/files/pubs/2020-07_Spatiotemporal-reservoir-resampling/ReSTIR.pdf)
7. [ReSTIR-GI](https://research.nvidia.com/publication/2021-06_restir-gi-path-resampling-real-time-path-tracing)
8. [Generalized Resampled Importance Sampling](https://research.nvidia.com/publication/2022-07_generalized-resampled-importance-sampling-foundations-restir)
