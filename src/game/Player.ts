import Matter from 'matter-js';

export class Player {
  public body: Matter.Body;
  public gamepadIndex: number;
  public gamepadId: string;
  public moveAxisX = 0;
  private color: string;
  private jumpPower = 12;
  private moveSpeed = 5;
  private canJump = false;
  private pushSlowdown = 1;

  constructor(gamepadIndex: number, gamepadId: string, x: number, y: number, color: string) {
    this.gamepadIndex = gamepadIndex;
    this.gamepadId = gamepadId;
    this.color = color;

    this.body = Matter.Bodies.rectangle(x, y, 40, 40, {
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0.05,
      inertia: Infinity, // Prevent rotation
      restitution: 0,    // No bounce
      label: 'player'
    });
  }

  handleInput(gp: { axes: ReadonlyArray<number>; buttons: ReadonlyArray<{ pressed: boolean }> }) {
    // Movement (Left Stick X)
    const moveX = gp.axes[0];
    this.moveAxisX = moveX;
    const inputX = Math.abs(moveX) > 0.2 ? moveX * this.moveSpeed * this.pushSlowdown : 0;
    Matter.Body.setVelocity(this.body, {
      x: inputX,
      y: this.body.velocity.y
    });

    // Jump ("A" / "X" button) (Xbox/PS)
    const jumpButton = gp.buttons[0];
    if (jumpButton.pressed && this.canJump) {
      Matter.Body.setVelocity(this.body, { 
        x: this.body.velocity.x, 
        y: -this.jumpPower 
      });
      this.canJump = false;
    }
  }

  update(isGrounded: boolean, canJump: boolean = isGrounded, pushSlowdown: number = 1) {
    this.canJump = canJump;
    this.pushSlowdown = pushSlowdown;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { x, y } = this.body.position;
    const angle = this.body.angle;

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.fillStyle = this.color;
    ctx.fillRect(-20, -20, 40, 40);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -20, 40, 40);
    ctx.restore();
  }
}
