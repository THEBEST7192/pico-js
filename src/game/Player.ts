import Matter from 'matter-js';

export class Player {
  public body: Matter.Body;
  public gamepadIndex: number;
  public gamepadId: string;
  private color: string;
  private jumpPower = 12;
  private moveSpeed = 5;
  private canJump = false;
  private carryX = 0;

  constructor(gamepadIndex: number, gamepadId: string, x: number, y: number, color: string) {
    this.gamepadIndex = gamepadIndex;
    this.gamepadId = gamepadId;
    this.color = color;

    this.body = Matter.Bodies.rectangle(x, y, 40, 40, {
      friction: 0.1,
      frictionStatic: 0.5,
      frictionAir: 0.05,
      inertia: Infinity, // Prevent rotation
      restitution: 0,    // No bounce
      label: 'player'
    });
  }

  handleInput(gp: Gamepad) {
    // Movement (Left Stick X)
    const moveX = gp.axes[0];
    const inputX = Math.abs(moveX) > 0.2 ? moveX * this.moveSpeed : 0;
    Matter.Body.setVelocity(this.body, {
      x: this.carryX + inputX,
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

  update(isGrounded: boolean, canJump: boolean = isGrounded, carryX: number = 0) {
    this.canJump = canJump;
    this.carryX = carryX;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { x, y } = this.body.position;
    const angle = this.body.angle;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = this.color;
    ctx.fillRect(-20, -20, 40, 40);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -20, 40, 40);
    ctx.restore();
  }
}
