## Understanding Primary Sample Space (PSS) and Random Replay in ReSTIR

Primary Sample Space (PSS) mapping is a fundamental concept, especially for techniques like random replay in ReSTIR. It ensures that a given sequence of random numbers consistently reconstructs the exact same path.

#### 1. Sequential Random Number Consumption

Imagine a continuous stream of random numbers (e.g. each `x` is a float between 0 and 1):
`xxxxxxxxxxxxxxxxxxxxxxxxxx`

In PSS, these numbers are consumed sequentially to make decisions along a path. For instance:

The first N_cam randoms (e.g., `xxxx`) determine the initial camera ray.
The next N_brdf randoms (e.g., `----xxxx`) are used to sample the BRDF at the first intersection. (This could be more or less than 4, depending on the BRDF complexity).
The subsequent N_light randoms (e.g., `--------xxxx`) might be used to sample a light source for Next Event Estimation (NEE).

Therefore, a specific sequence of random numbers uniquely defines a complete path, including its length, bounce types, and sampled directions/components. For example,
`xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
might describe "a path of length 5, where the final vertex connects to light source Ls via NEE."

This consistency is critical: two identical input sequences of random numbers must produce identical paths. This ensures that path properties and contributions can be correctly evaluated and reused.

#### 2. Random Replay optimizations in ReSTIR

In ReSTIR's random replay, we reuse path information from previously traced paths (stored in reservoirs). Consider replaying a path of length 5 that originally terminated with an NEE light sample at its 5th vertex.

When re-evaluating this path, performing NEE (e.g., calling `sampleLight()`) at intermediate vertices (1 through 4) is unnecessary computation, as we know the original path didn't use those light samples; it only performed NEE at the 5th vertex. Thus we often want to skip these `sampleLight()` computations for efficiency.

However simply skipping the `sampleLight()` computation without accounting for its random number consumption breaks PSS.
If `sampleLight()` normally consumes, say, 4 random numbers, not consuming them means the subsequent random numbers used for, say, the next BRDF sample, will be different from those used in the original path.
This would alter the replayed path, violating PSS consistency and leading to incorrect results.

#### 3. Solution: Skipping Random Numbers

The crucial step is this: if we skip the `sampleLight()` computation at an intermediate vertex, _we must still advance our random number generator by the number of randoms `sampleLight()` would have consumed_ (e.g., 4 numbers). This ensures that the random numbers available for subsequent path decisions (like the next BRDF sample) remain synchronized with the original path, preserving PSS integrity.

This leads to a practical consideration for implementation:

sampleBrdf: BRDF sampling is _always_ performed at every path vertex, and the number of randoms it consumes can vary (e.g., different materials might need different numbers of randoms). This variability is fine, because the sampleBrdf function (and thus its random number consumption) is _always_ executed during random replay. The PSS mapping for the BRDF part remains consistent because the call is always made.

sampleLight (for NEE): Because NEE might be skipped during replay (as in our example), it's advantageous for `sampleLight()` to consume a fixed, known number of randoms (e.g., always 4). This makes it straightforward to "skip" these randoms by simply advancing the generator by that fixed amount. If `sampleLight()` consumed a variable number of randoms depending on the light source or material, determining how many randoms to skip would become more complex, potentially requiring re-evaluation of parts of the light sampling logic just to know how many randoms to discard.
