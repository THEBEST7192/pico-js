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
  private isJumping = false;
  private jumpBuffer = 0;
  private readonly JUMP_BUFFER_MAX = 10; // frames
  private coyoteTime = 0;
  private readonly COYOTE_TIME_MAX = 8; // frames
  private readonly EXTRA_GRAVITY = 0.75;

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
    
    if (jumpButton.pressed) {
      this.jumpBuffer = this.JUMP_BUFFER_MAX;
    }

    if (this.jumpBuffer > 0 && (this.canJump || this.coyoteTime > 0)) {
      Matter.Body.setVelocity(this.body, { 
        x: this.body.velocity.x, 
        y: -this.jumpPower 
      });
      this.canJump = false;
      this.coyoteTime = 0;
      this.isJumping = true;
      this.jumpBuffer = 0;
    }

    if (!jumpButton.pressed) {
      // If button is not held while moving up, apply extra "gravity" for a smoother variable jump
      if (this.isJumping && this.body.velocity.y < -1) {
        Matter.Body.setVelocity(this.body, {
          x: this.body.velocity.x,
          y: this.body.velocity.y * this.EXTRA_GRAVITY // 0.75
        });
      }
    }

    if (this.body.velocity.y > 0) {
      Matter.Body.applyForce(this.body, this.body.position, { x: 0, y: 0.0005 });
    }
  }

  
  update(isGrounded: boolean, canJump: boolean = isGrounded, pushSlowdown: number = 1) {
    this.canJump = canJump;
    if (isGrounded) {
      this.isJumping = false;
      this.coyoteTime = this.COYOTE_TIME_MAX;
    } else {
      if (this.coyoteTime > 0) this.coyoteTime--;
    }

    if (this.jumpBuffer > 0) {
      this.jumpBuffer--;
    }
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
