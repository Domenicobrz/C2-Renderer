### High priority:

The emitted power of area lights doesn't follow the approach in PBRT (`DiffuseAreaLight::Phi`):
https://pbr-book.org/4ed/Light_Sources/Area_Lights

---

Seems like each MIS rendering option converges to a different result
the largest offender is NEXT_EVENT_ESTIMATION where it feels like we're gathering
a lot more energy than normal

ONE_SAMPLE_MODEL gets closer to the BRDF_ONLY output but there are still differences

---

Rewrite the Triangle.idxRef logic such that it's not required to save the idxRef prop

colors are using 1 byte per channel, this is likely wrong / problematic

### Low priority:

IsInf(...)
doesn't really check if the number is infinite
