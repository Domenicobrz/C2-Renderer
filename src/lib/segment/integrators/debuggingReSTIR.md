Debugging ReSTIR is often very challenging, here are some tips to help pinpoint issues with the implementation
whenever difference are found between the ground truth simple path tracer integrator and ReSTIR-PT

Try to determine at which bounce the issue starts to appear. ReSTIR has known reconnection cases and knowing the bounce
where problems appears is a useful first step in determining which case could be causing problems

Switch to 1 spatial-reuse sample and disable temporal reuse. Also set spatial-reuse-passes to 1. Make sure the standard GBH variant is seleted (since pairwise MIS will skip the random replay if we only have 1 sr sample). Also set initial-candidates count to 1.
If the result doesn't follow ground truth, you can rule out issues with spatial resampling and focus on the correctness of the random replay for the path that is selected by the initial candidate selection -- that is the easiest way of debugging and also where you should start.

When debugging, always switch to the default GBH variant since it's easier to understand

If using a single spatial resample with the default GBH variant generates a result that is identical to ground truth, then (and this is the though part) we have to debug the spatial resampling logic

Very often, the issues will be rooted inside the GBH function, some reused paths will very likely not respect the invertibility principle and cause bias

Depending on the nature of the bias, there are a few options, here's an example when bias results in brighter images:

1. since there's an increase in radiance, inside the GBH there could be paths that are failing, and should not fail. This could result in higher mi values than expected
2. maybe in GBH 2-3 out of 6 candidates are usually ok. But in the resample loop, we're using 6 candidates instead of 3. which means some resample candidate should have failed their reconnection, but did not
3. reconnection paths are returning more contribution than they should (usually ruled out by the very first debugging approach described earlier)

Try your best to remove as many elements as possible from the scene, and turning as many dials as necessary to show the issue as much as possible

Another useful metric to inspect is miSums (what's the sum of the mi values in the resampling loop?)
Values that are much higher or much smaller than 1 can be a red flag. If you're consistently seeing values larger than 1 in multiple successive frames, that's also a red flag

Here's a sample debug log for wi, mi, length(Y.F), Wxi for a 3sr test, 1spatial pass, over multiple frames:

```
wi,       mi,      length(Y.F), Wxi         wi,      mi,     length(Y.F), Wxi         wi,     mi,     length(Y.F), Wxi
____________________________________________________________________________________________________________________
0.03315,  0.2085,  0.1590,  1.000,     |    0,       1,      0,       1          |
0.007,    0.1420,  0.0543,  1,         |    0,       1,      0,       1.0000,    |    0.0033, 0.0229, 0.1441, 1.0209
0,        1,       0,       1.0003,    |    0.00764, 0.4961, 0.01526, 1.0089     |
0.0000,   0.2842,  0.0001,  1,         |    0.0004,  0.0024, 0.1623,  1.2698,    |    0,      0.9999, 0,      1.0000
0.0000,   0.2976,  0.0001,  0.9999,    |    0.0393,  0.2431, 0.1616,  1.000,     |    0,      1,      0,      1.004
0.0400,   0.2118,  0.1887,  1.0002,    |    0,       0.5237, 0,       0.9999,    |    0,      0.4797, 0,      1.0000
0,        0.9999,  0,       1.0001     |                                         |
0.000006, 0.2006,  0.00003, 0.9999,    |    0,       0.6313, 0,       1,         |    0,      0.3578, 0,      1
0.0147,   0.1095,  0.1348,  1.0009,    |    0,       0.5217, 0,       1.0003,    |    0,      0.4804, 0,      1
0.0026,   0.04885, 0.05473, 1.0025,    |    0,       0.4767, 0,       1.0002,    |    0,      0.5179, 0,      1.0001
```

Sometimes, in the GBH you'll realize that certain paths shouldn't contribute, e.g.:
you get inside the GBH with a canonical brdf-sampled path that escapes into the envmap at bounce 2.
the first spatial-reuse candidate inside the GBH loop, also escapes into the envmap at bounce 2 and contributes a little bit
the second spatial-reuse candidate inside the GBH loop, also escapes into the envmap, but at bounce 1 instead of 2. And it contributes a significant portion to the mi value. But wait. That should not be possible, since the envmap path stops at 1 bounce, and not 2, like the canonical candidate states. This path should have not contributed at all since it breaks invertibility, but it did contribute when it shouldn't have. This is a real-world example of a bug I've found in my implementation and how I managed to find the problem
