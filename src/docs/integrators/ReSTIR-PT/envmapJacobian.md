the Jacobian is calculated as:

`let jacobian = (Y.jacobian.x / X.jacobian.x) * abs(Y.jacobian.y / X.jacobian.y);`

Let's focus on the y part:
`abs(Y.jacobian.y / X.jacobian.y)`

The .y component is calculated in our pathConstruction as e.g.:
`abs(dot(w_km1, recVertex.geometricNormal)) / dot(w_vec, w_vec)`

w_vec is:
`let w_vec = recVertex.hitPoint - ires.hitPoint;`

in case of "hitting" an envmap with NEE, and the hit is also considered as the reconnection point,
we have an infinite-length w_vec

thus we have the y component as:
`abs(dot(w_km1, recVertex.geometricNormal)) / infinity`

However remember that we have to divide the y components of two jacobians:
`abs(Y.jacobian.y / X.jacobian.y);`

if we expand we could have:
`abs(  (a / infinity) / (b / infinity)  );`

which simplifies to:
`abs(  a / b  );`

let's analyze now the "a" term (same for b)
`dot(w_km1, recVertex.geometricNormal)`

an envmap has the geometric normal that is equal to the w_km1 direction, thus the dot is -1
if we abs it, we have 1
