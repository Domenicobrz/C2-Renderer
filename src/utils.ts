import { Vector3 } from "three";

function xmur3(str : string) {
    for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353),
        h = h << 13 | h >>> 19;
    return function() {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

var seed = xmur3("apples");

function sfc32(a : number, b : number, c : number, d : number) {
    return function() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
      var t = (a + b) | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = (c << 21 | c >>> 11);
      d = d + 1 | 0;
      t = t + d | 0;
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    }
}


export var rand = Math.random;
export function nrand(value : number = 1) : number {
    return (rand() * 2 - 1) * value;
};


// from https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
// DO NOT USE RAND() OR NRAND() FOR CALCULATIONS THAT DETERMINE RADIANCE COMPUTATION
// OTHERWISE EACH WEBWORKER WOULD GET THE SAME VALUES
export var seededRand = sfc32(seed(), seed(), seed(), seed());
export function seededNrand(value : number = 1) : number {
    return (seededRand() * 2 - 1) * value;
};


export function vec3(x : number, y : number, z : number) : Vector3 {
    return new Vector3(x,y,z);
}