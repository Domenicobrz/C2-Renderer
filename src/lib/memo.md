### What's the optimal work group size?

[source](https://surma.dev/things/webgpu/)

> advice that Corentin gave me: “Use [a workgroup size of] 64 unless you know 
  what GPU you are targeting or that your workload needs something different.” 
  It seems to be a safe number that performs well across many GPUs and allows 
  the GPU scheduler to keep as many EUs as possible busy.

> @workgroup_size(64) is equivalent to @workgroup_size(64, 1, 1).


### WebGPU Typescript
WebGPU typescript types are loaded from an external library:
[link](https://github.com/gpuweb/types)
apparently the standard installation didn't include WebGPU types