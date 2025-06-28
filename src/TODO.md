### Medium priority:

The emitted power of area lights doesn't follow the approach in PBRT (`DiffuseAreaLight::Phi`):
https://pbr-book.org/4ed/Light_Sources/Area_Lights

---

camera holds some buffers, I'll have to create a dispose method

---

Diffuse lambert and Diffuse EON fail the furnace test by a small margin

---

Rewrite the Triangle.idxRef logic such that it's not required to save the idxRef prop

colors are using 1 byte per channel, this is likely wrong / problematic

### Low priority:

IsInf(...)
doesn't really check if the number is infinite
