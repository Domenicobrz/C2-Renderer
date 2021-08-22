import { Ray, Vector2, Vector3 } from "three";

export class Camera {
    constructor(
        public center : Vector3,
        public target : Vector3,
        public canvasSize : Vector2,
        public fov : number,    
    ) { }

    getRay(x : number, y : number) : Ray {

        x += Math.random();
        y += Math.random();

        // range [-1 ... +1]
        let uv = new Vector2(
            (x / this.canvasSize.x) * 2 - 1, 
            (y / this.canvasSize.y) * 2 - 1
        );

        let aspectRatio = this.canvasSize.x / this.canvasSize.y;
        uv.x *= aspectRatio;

        let yAxisScale = Math.tan(this.fov);

        uv.multiplyScalar(yAxisScale);

        let ray : Ray = new Ray(
            this.center.clone(), 
            new Vector3(uv.x, uv.y, 1).normalize(),
        );

        return ray;
    }
}