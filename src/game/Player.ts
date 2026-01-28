import Matter from 'matter-js';

export class Player {
  public body: Matter.Body;
  public gamepadIndex: number;
  public gamepadId: string;
  private color: string;
  private jumpPower = 12;
  private moveSpeed = 5;
  private isGrounded = false;

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
    if (Math.abs(moveX) > 0.2) {
      Matter.Body.setVelocity(this.body, { 
        x: moveX * this.moveSpeed, 
        y: this.body.velocity.y 
      });
    } else {
      // Stop horizontal movement when stick is released
      Matter.Body.setVelocity(this.body, { 
        x: 0, 
        y: this.body.velocity.y 
      });
    }

    // Jump ("A" / "X" button) (Xbox/PS)
    const jumpButton = gp.buttons[0];
    if (jumpButton.pressed && this.isGrounded) {
      Matter.Body.setVelocity(this.body, { 
        x: this.body.velocity.x, 
        y: -this.jumpPower 
      });
      this.isGrounded = false;
    }
  }

  update(isGrounded: boolean) {
    this.isGrounded = isGrounded;
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
