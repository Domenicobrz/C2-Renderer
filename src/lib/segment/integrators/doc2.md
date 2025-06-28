We have:

````
setReconnectionVertex(...);

if (lightSampleSuccessful) {
  neePathConstruction(...);
}

if (there's emission) {
  emissiveSurfacePathConstruction(...);
}
```;

`setReconnectionVertex` will set the properties of the reconnection vertex, including:
jacobian for the brdf sample, reconnection direction of the brdf sample, path reconnection flags

However `neePathConstruction`, which may happen right after the `setReconnectionVertex` call,
might have to change the values of the jacobian (to use the light sample probabilities) or the
reconnection direction (light sample dir) or the flags. We obviously don't want these changes to
then be stored for paths whose light contribution arrives many vertex after the reconnection vertex,
thus the properties set by `setReconnectionVertex` will never be overridden later, they're just
read-only. **We should infact use a copy of the path info instead of a pointer**

A similiar problem happens for `emissiveSurfacePathConstruction` since it may use the simplified
jacobian with only one element instead of two, we obviously don't want that jacobian to remain stored
when continuing with the rest of the bounces, because further along the path we'll need the full
jacobian
````
