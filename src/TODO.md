Seems like each MIS rendering option converges to a different result
the largest offender is NEXT_EVENT_ESTIMATION where it feels like we're gathering
a lot more energy than normal

ONE_SAMPLE_MODEL gets closer to the BRDF_ONLY output but there are still differences

---

Rewrite the Triangle.idxRef logic such that it's not required to save the idxRef prop

colors are using 1 byte per channel, this is likely wrong / problematic

---

IsInf(...)
doesn't really check if the number is infinite
