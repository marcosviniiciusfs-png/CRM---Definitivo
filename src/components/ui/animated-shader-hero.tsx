import React, { useRef, useEffect } from 'react';

interface HeroProps {
  trustBadge?: {
    text: string;
    icons?: string[];
  };
  headline: {
    line1: string;
    line2: string;
  };
  subtitle: string;
  buttons?: {
    primary?: {
      text: string;
      onClick?: () => void;
    };
    secondary?: {
      text: string;
      onClick?: () => void;
    };
  };
  className?: string;
}

/* Red-tinted shader matching Kairoz CRM theme */
const kairozShaderSource = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
uniform vec2 move;
uniform vec2 touch;
uniform int pointerCount;
uniform vec2 pointers[8];
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p){p=fract(p*vec2(12.9898,78.233));p+=dot(p,p+34.56);return fract(p.x*p.y);}
float noise(in vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);float a=rnd(i),b=rnd(i+vec2(1,0)),c=rnd(i+vec2(0,1)),d=rnd(i+1.);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 p){float t=.0,a=1.;mat2 m=mat2(1.,-.5,.2,1.2);for(int i=0;i<5;i++){t+=a*noise(p);p*=2.*m;a*=.5;}return t;}
float clouds(vec2 p){float d=1.,t=.0;for(float i=.0;i<3.;i++){float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);t=mix(t,d,a);d=a;p*=2./(i+1.);}return t;}
void main(void){
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for(float i=1.;i<12.;i++){
    uv+=.1*cos(i*vec2(.1+.01*i,.8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.)*vec3(1.8,.15,.15);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)))*vec3(1.5,.1,.1);
    col=mix(col,vec3(bg*.45,bg*.04,bg*.04),d);
  }
  O=vec4(col,1);
}`;

class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vs: WebGLShader | null = null;
  private fs: WebGLShader | null = null;
  private buffer: WebGLBuffer | null = null;
  private scale: number;
  private shaderSource: string;
  private mouseMove = [0, 0];
  private mouseCoords = [0, 0];
  private pointerCoords: number[] = [];
  private nbrOfPointers = 0;

  private vertexSrc = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

  private vertices = [-1, 1, -1, -1, 1, 1, 1, -1];

  constructor(canvas: HTMLCanvasElement, scale: number) {
    this.canvas = canvas;
    this.scale = scale;
    this.gl = canvas.getContext('webgl2')!;
    this.gl.viewport(0, 0, canvas.width * scale, canvas.height * scale);
    this.shaderSource = kairozShaderSource;
  }

  updateMove(deltas: number[]) { this.mouseMove = deltas; }
  updateMouse(coords: number[]) { this.mouseCoords = coords; }
  updatePointerCoords(coords: number[]) { this.pointerCoords = coords; }
  updatePointerCount(nbr: number) { this.nbrOfPointers = nbr; }

  updateScale(scale: number) {
    this.scale = scale;
    this.gl.viewport(0, 0, this.canvas.width * scale, this.canvas.height * scale);
  }

  compile(shader: WebGLShader, source: string) {
    const gl = this.gl;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
    }
  }

  test(source: string) {
    const gl = this.gl;
    const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    let result = null;
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      result = gl.getShaderInfoLog(shader);
    }
    gl.deleteShader(shader);
    return result;
  }

  reset() {
    const gl = this.gl;
    if (this.program && !gl.getProgramParameter(this.program, gl.DELETE_STATUS)) {
      if (this.vs) { gl.detachShader(this.program, this.vs); gl.deleteShader(this.vs); }
      if (this.fs) { gl.detachShader(this.program, this.fs); gl.deleteShader(this.fs); }
      gl.deleteProgram(this.program);
    }
  }

  setup() {
    const gl = this.gl;
    this.vs = gl.createShader(gl.VERTEX_SHADER)!;
    this.fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    this.compile(this.vs, this.vertexSrc);
    this.compile(this.fs, this.shaderSource);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, this.vs);
    gl.attachShader(this.program, this.fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(this.program));
    }
  }

  init() {
    const gl = this.gl;
    const program = this.program!;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    (program as any).resolution = gl.getUniformLocation(program, 'resolution');
    (program as any).time = gl.getUniformLocation(program, 'time');
    (program as any).move = gl.getUniformLocation(program, 'move');
    (program as any).touch = gl.getUniformLocation(program, 'touch');
    (program as any).pointerCount = gl.getUniformLocation(program, 'pointerCount');
    (program as any).pointers = gl.getUniformLocation(program, 'pointers');
  }

  render(now = 0) {
    const gl = this.gl;
    const program = this.program;
    if (!program || gl.getProgramParameter(program, gl.DELETE_STATUS)) return;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.uniform2f((program as any).resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f((program as any).time, now * 1e-3);
    gl.uniform2f((program as any).move, ...this.mouseMove);
    gl.uniform2f((program as any).touch, ...this.mouseCoords);
    gl.uniform1i((program as any).pointerCount, this.nbrOfPointers);
    gl.uniform2fv((program as any).pointers, new Float32Array(this.pointerCoords.length > 0 ? this.pointerCoords : [0, 0]));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

class PointerHandler {
  private scale: number;
  private active = false;
  private pointers = new Map<number, number[]>();
  private lastCoords = [0, 0];
  private moves = [0, 0];

  constructor(element: HTMLCanvasElement, scale: number) {
    this.scale = scale;
    const map = (el: HTMLCanvasElement, s: number, x: number, y: number) =>
      [x * s, el.height - y * s];

    element.addEventListener('pointerdown', (e) => {
      this.active = true;
      this.pointers.set(e.pointerId, map(element, this.scale, e.offsetX, e.offsetY));
    });
    element.addEventListener('pointerup', (e) => {
      if (this.count === 1) this.lastCoords = this.first;
      this.pointers.delete(e.pointerId);
      this.active = this.pointers.size > 0;
    });
    element.addEventListener('pointerleave', (e) => {
      if (this.count === 1) this.lastCoords = this.first;
      this.pointers.delete(e.pointerId);
      this.active = this.pointers.size > 0;
    });
    element.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      this.lastCoords = [e.offsetX, e.offsetY];
      this.pointers.set(e.pointerId, map(element, this.scale, e.offsetX, e.offsetY));
      this.moves = [this.moves[0] + e.movementX, this.moves[1] + e.movementY];
    });
  }

  updateScale(scale: number) { this.scale = scale; }
  get count() { return this.pointers.size; }
  get move() { return this.moves; }
  get coords() { return this.pointers.size > 0 ? Array.from(this.pointers.values()).flat() : [0, 0]; }
  get first() { return this.pointers.values().next().value || this.lastCoords; }
}

function useShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const pointersRef = useRef<PointerHandler | null>(null);

  const resize = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    if (rendererRef.current) rendererRef.current.updateScale(dpr);
    if (pointersRef.current) pointersRef.current.updateScale(dpr);
  };

  const loop = (now: number) => {
    if (!rendererRef.current || !pointersRef.current) return;
    rendererRef.current.updateMouse(pointersRef.current.first);
    rendererRef.current.updatePointerCount(pointersRef.current.count);
    rendererRef.current.updatePointerCoords(pointersRef.current.coords);
    rendererRef.current.updateMove(pointersRef.current.move);
    rendererRef.current.render(now);
    animationFrameRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
    rendererRef.current = new WebGLRenderer(canvas, dpr);
    pointersRef.current = new PointerHandler(canvas, dpr);
    rendererRef.current.setup();
    rendererRef.current.init();
    resize();
    loop(0);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current) rendererRef.current.reset();
    };
  }, []);

  return canvasRef;
}

const Hero: React.FC<HeroProps> = ({
  trustBadge,
  headline,
  subtitle,
  buttons,
  className = ""
}) => {
  const canvasRef = useShaderBackground();

  return (
    <div className={`relative w-full min-h-[86vh] flex flex-col overflow-hidden bg-black ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ background: 'black' }}
      />

      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none z-[3] overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)' }} />
        <div className="absolute left-0 right-0 h-20" style={{ background: 'linear-gradient(180deg,transparent,rgba(220,38,38,.05),transparent)', animation: 'scanline 7s linear infinite' }} />
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 z-[2] pointer-events-none" style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,.55) 0%,rgba(0,0,0,.15) 40%,rgba(0,0,0,.15) 60%,rgba(0,0,0,.7) 100%)' }} />

      {/* Grid floor */}
      <div className="absolute bottom-0 left-0 right-0 h-[180px] pointer-events-none z-[2]" style={{
        backgroundImage: 'linear-gradient(rgba(220,38,38,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(220,38,38,.18) 1px,transparent 1px)',
        backgroundSize: '36px 36px',
        animation: 'grid-scroll 3s linear infinite',
        transform: 'perspective(500px) rotateX(28deg)',
        transformOrigin: 'bottom'
      }}>
        <div className="absolute bottom-0 left-0 right-0 h-[55%]" style={{ background: 'linear-gradient(to top,#000,transparent)' }} />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 text-white text-center px-6 pt-28 pb-20">
        {trustBadge && (
          <div className="mb-6 hero-fade-in-down">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 backdrop-blur-md rounded-full text-xs font-bold tracking-[.14em] uppercase" style={{ background: 'rgba(0,0,0,.6)', border: '1px solid rgba(220,38,38,.55)', color: '#fca5a5' }}>
              {trustBadge.icons && trustBadge.icons.map((icon, index) => (
                <span key={index} className="w-1.5 h-1.5 rounded-full" style={{ background: '#dc2626', animation: 'dot-blink 1.4s ease-in-out infinite' }} />
              ))}
              <span>{trustBadge.text}</span>
            </div>
          </div>
        )}

        <div className="space-y-2 max-w-5xl mx-auto">
          <h1 className="text-[clamp(52px,9vw,96px)] font-black leading-[.92] tracking-[-.04em] mb-5">
            <span className="block text-white hero-fade-in-up" style={{ textShadow: '0 2px 20px rgba(0,0,0,.8)', animationDelay: '.15s' }}>
              {headline.line1}
            </span>
            <span className="block hero-fade-in-up" style={{ color: '#606060', animation: 'fade-in-up .7s .3s ease-out both' }}>
              {headline.line2}
            </span>
          </h1>

          <div className="max-w-xl mx-auto hero-fade-in-up" style={{ animationDelay: '.45s' }}>
            <p className="text-base leading-relaxed font-light" style={{ color: 'rgba(255,255,255,.75)', textShadow: '0 1px 8px rgba(0,0,0,.9)' }} dangerouslySetInnerHTML={{ __html: subtitle }} />
          </div>

          {buttons && (
            <div className="flex flex-wrap gap-3 justify-center mt-8 hero-fade-in-up" style={{ animationDelay: '.6s' }}>
              {buttons.primary && (
                <button
                  onClick={buttons.primary.onClick}
                  className="px-8 py-4 text-sm font-bold tracking-[.07em] uppercase text-white transition-all duration-300 hover:scale-[1.04] hover:shadow-xl"
                  style={{
                    background: '#dc2626',
                    clipPath: 'polygon(9px 0%,100% 0%,calc(100% - 9px) 100%,0% 100%)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#dc2626')}
                >
                  {buttons.primary.text}
                </button>
              )}
              {buttons.secondary && (
                <button
                  onClick={buttons.secondary.onClick}
                  className="px-8 py-4 text-sm font-semibold tracking-[.07em] uppercase text-white backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]"
                  style={{
                    background: 'rgba(0,0,0,.5)',
                    border: '1px solid rgba(255,255,255,.3)',
                    clipPath: 'polygon(9px 0%,100% 0%,calc(100% - 9px) 100%,0% 100%)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,.6)';
                    e.currentTarget.style.background = 'rgba(255,255,255,.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,.3)';
                    e.currentTarget.style.background = 'rgba(0,0,0,.5)';
                  }}
                >
                  {buttons.secondary.text}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Hero;
