/* VULPIXISM 5.32 — webgl-engine.js */
'use strict';

const VulpixismGL = (() => {
  let gl = null, canvas = null;

  const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main(){v_uv=a_uv;gl_Position=vec4(a_pos,0.,1.);}`;

  const FRAG_BASE = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_time;
in vec2 v_uv;
out vec4 fragColor;`;

  const SHADERS = {
    passthrough: FRAG_BASE + `void main(){fragColor=texture(u_tex,v_uv);}`,

    noise: FRAG_BASE + `
uniform float u_intensity;
uniform float u_animated;
float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec4 c=texture(u_tex,v_uv);
  float t=u_animated>0.5?u_time:0.;
  float n=(rand(v_uv+t)-.5)*u_intensity;
  fragColor=vec4(c.rgb+n,c.a);
}`,

    tzatzki: FRAG_BASE + `
uniform float u_radius;
uniform float u_strength;
void main(){
  vec2 p=v_uv-.5;
  float d=length(p);
  float r=u_radius;
  if(d<r){
    float f=pow(1.-d/r,u_strength);
    p=p*(1.-f)+normalize(p)*f*r;
  }
  fragColor=texture(u_tex,p+.5);
}`,

    tint: FRAG_BASE + `
uniform float u_r;uniform float u_g;uniform float u_b;uniform float u_a;
void main(){
  vec4 c=texture(u_tex,v_uv);
  fragColor=mix(c,vec4(c.r*u_r,c.g*u_g,c.b*u_b,c.a),u_a);
}`,

    turbulent: FRAG_BASE + `
uniform float u_amount;uniform float u_size;uniform float u_speed;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.-2.*f);
  float a=hash(i);float b=hash(i+vec2(1,0));float c=hash(i+vec2(0,1));float d=hash(i+vec2(1,1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
void main(){
  float t=u_time*u_speed;
  float s=u_size/512.;
  float nx=noise(v_uv/s+vec2(t,0.))-.5;
  float ny=noise(v_uv/s+vec2(0.,t+5.3))-.5;
  vec2 uv=v_uv+vec2(nx,ny)*u_amount/1000.;
  fragColor=texture(u_tex,clamp(uv,0.,1.));
}`,

    wavewarp: FRAG_BASE + `
uniform float u_amplitude;uniform float u_frequency;uniform float u_speed;uniform float u_direction;
void main(){
  float a=radians(u_direction);
  float t=u_time*u_speed;
  float w=sin((v_uv.x*cos(a)+v_uv.y*sin(a))*u_frequency+t)*u_amplitude/1000.;
  vec2 uv=v_uv+vec2(-sin(a),cos(a))*w;
  fragColor=texture(u_tex,clamp(uv,0.,1.));
}`,

    kaleidoscope: FRAG_BASE + `
uniform float u_segments;uniform float u_angle;
void main(){
  vec2 p=v_uv-.5;
  float r=length(p);
  float a=atan(p.y,p.x)+radians(u_angle);
  float slice=6.2831853/u_segments;
  a=mod(a,slice);
  if(a>slice*.5)a=slice-a;
  vec2 uv=vec2(cos(a),sin(a))*r+.5;
  fragColor=texture(u_tex,uv);
}`,

    motiontile: FRAG_BASE + `
uniform float u_tilesH;uniform float u_tilesV;uniform float u_phase;
void main(){
  vec2 uv=fract(v_uv*vec2(u_tilesH,u_tilesV)+vec2(u_phase,u_phase)*u_time*.5);
  fragColor=texture(u_tex,uv);
}`,

    chromatic: FRAG_BASE + `
uniform float u_amount;uniform float u_angle;
void main(){
  float a=radians(u_angle);
  vec2 off=vec2(cos(a),sin(a))*u_amount/1000.;
  float r=texture(u_tex,v_uv+off).r;
  float g=texture(u_tex,v_uv).g;
  float b=texture(u_tex,v_uv-off).b;
  float alpha=texture(u_tex,v_uv).a;
  fragColor=vec4(r,g,b,alpha);
}`,

    huesat: FRAG_BASE + `
uniform float u_hue;uniform float u_saturation;uniform float u_lightness;
vec3 rgb2hsl(vec3 c){float mx=max(c.r,max(c.g,c.b));float mn=min(c.r,min(c.g,c.b));float h=0.,s=0.,l=(mx+mn)/2.;
  if(mx!=mn){float d=mx-mn;s=l>.5?d/(2.-mx-mn):d/(mx+mn);
    if(mx==c.r)h=(c.g-c.b)/d+(c.g<c.b?6.:0.);
    else if(mx==c.g)h=(c.b-c.r)/d+2.;
    else h=(c.r-c.g)/d+4.;h/=6.;}return vec3(h,s,l);}
float hue2rgb(float p,float q,float t){if(t<0.)t+=1.;if(t>1.)t-=1.;if(t<1./6.)return p+(q-p)*6.*t;if(t<1./2.)return q;if(t<2./3.)return p+(q-p)*(2./3.-t)*6.;return p;}
vec3 hsl2rgb(vec3 c){if(c.y==0.)return vec3(c.z);float q=c.z<.5?c.z*(1.+c.y):c.z+c.y-c.z*c.y;float p=2.*c.z-q;return vec3(hue2rgb(p,q,c.x+1./3.),hue2rgb(p,q,c.x),hue2rgb(p,q,c.x-1./3.));}
void main(){
  vec4 col=texture(u_tex,v_uv);
  vec3 hsl=rgb2hsl(col.rgb);
  hsl.x=fract(hsl.x+u_hue/360.);
  hsl.y=clamp(hsl.y+u_saturation/100.,0.,1.);
  hsl.z=clamp(hsl.z+u_lightness/100.,0.,1.);
  fragColor=vec4(hsl2rgb(hsl),col.a);
}`,

    swirl: FRAG_BASE + `
uniform float u_angle;uniform float u_radius;
void main(){
  vec2 p=v_uv-.5;
  float d=length(p);
  float a=atan(p.y,p.x)+radians(u_angle)*max(0.,1.-d/u_radius);
  fragColor=texture(u_tex,vec2(cos(a),sin(a))*d+.5);
}`,

    halftone: FRAG_BASE + `
uniform float u_dotSize;uniform float u_softness;
void main(){
  vec4 c=texture(u_tex,v_uv);
  float brightness=dot(c.rgb,vec3(.299,.587,.114));
  vec2 cell=floor(v_uv*512./u_dotSize)*u_dotSize/512.;
  vec2 center=cell+u_dotSize/512.*.5;
  float dist=length(v_uv-center)/(u_dotSize/512.*.5);
  float dot_=1.-smoothstep(brightness-u_softness*.5,brightness+u_softness*.5,dist);
  fragColor=vec4(vec3(dot_),c.a);
}`,

    colorbalance: FRAG_BASE + `
uniform float u_shadows;uniform float u_midtones;uniform float u_highlights;
void main(){
  vec4 c=texture(u_tex,v_uv);
  float l=dot(c.rgb,vec3(.299,.587,.114));
  float sw=1.-smoothstep(.0,.5,l);
  float mw=1.-abs(l-.5)*2.;
  float hw=smoothstep(.5,1.,l);
  vec3 col=c.rgb+vec3(u_shadows)*sw+vec3(u_midtones)*mw+vec3(u_highlights)*hw;
  fragColor=vec4(clamp(col,0.,1.),c.a);
}`,

    meshglitch: FRAG_BASE + `
uniform float u_intensity;uniform float u_segments;
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  float seg=floor(v_uv.y*u_segments)/u_segments;
  float t=floor(u_time*10.)/10.;
  float r=rand(vec2(seg,t));
  float shift=r<u_intensity?(rand(vec2(seg,t+.1))-.5)*.1:0.;
  fragColor=texture(u_tex,vec2(fract(v_uv.x+shift),v_uv.y));
}`,

    glitch: FRAG_BASE + `
uniform float u_intensity;uniform float u_speed;
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  float t=floor(u_time*u_speed*10.)/10.;
  float row=floor(v_uv.y*20.)/20.;
  float r=rand(vec2(row,t));
  vec2 uv=v_uv;
  if(r<u_intensity){
    float shift=(rand(vec2(row,t+1.))-.5)*.15;
    uv.x=fract(uv.x+shift);
    float cr=(rand(vec2(uv.x,t+2.))-.5)*.03;
    float rr=texture(u_tex,vec2(uv.x+cr,uv.y)).r;
    float gb=texture(u_tex,uv).g;
    float bb=texture(u_tex,vec2(uv.x-cr,uv.y)).b;
    fragColor=vec4(rr,gb,bb,1.);
    return;
  }
  fragColor=texture(u_tex,uv);
}`,

    bloom: FRAG_BASE + `
uniform float u_threshold;uniform float u_intensity;uniform float u_radius;
void main(){
  vec4 c=texture(u_tex,v_uv);
  vec3 bright=max(c.rgb-u_threshold,0.);
  vec3 blur=vec3(0.);
  float total=0.;
  float r=u_radius/512.;
  for(int i=-4;i<=4;i++){for(int j=-4;j<=4;j++){
    float w=exp(-float(i*i+j*j)*.5);
    vec2 uv=v_uv+vec2(float(i),float(j))*r;
    vec4 s=texture(u_tex,clamp(uv,0.,1.));
    blur+=max(s.rgb-u_threshold,0.)*w;total+=w;
  }}
  blur/=total;
  fragColor=vec4(c.rgb+blur*u_intensity,c.a);
}`,

    lightrays: FRAG_BASE + `
uniform float u_intensity;uniform float u_decay;uniform float u_angle;
void main(){
  vec2 light=vec2(cos(radians(u_angle)),sin(radians(u_angle)))*.5+.5;
  vec2 d=(v_uv-light)/12.;
  vec2 uv=v_uv;
  float illum=0.;
  float dec=1.;
  for(int i=0;i<12;i++){
    uv-=d;
    illum+=texture(u_tex,clamp(uv,0.,1.)).r*dec;
    dec*=u_decay;
  }
  illum*=u_intensity/12.;
  vec4 c=texture(u_tex,v_uv);
  fragColor=vec4(c.rgb+illum,c.a);
}`,

    mirror: FRAG_BASE + `
uniform int u_axis;
void main(){
  vec2 uv=v_uv;
  if(u_axis==0||u_axis==2)uv.x=uv.x>.5?1.-uv.x:uv.x;
  if(u_axis==1||u_axis==2)uv.y=uv.y>.5?1.-uv.y:uv.y;
  fragColor=texture(u_tex,uv);
}`,

    pinchbulge: FRAG_BASE + `
uniform float u_amount;uniform float u_radius;
void main(){
  vec2 p=v_uv-.5;
  float d=length(p);
  float r=u_radius;
  float f=d<r?pow(d/r,1.+u_amount)*r:d;
  vec2 uv=normalize(p)*f+.5;
  fragColor=texture(u_tex,clamp(uv,0.,1.));
}`,
  };

  const programs = {};

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  function buildProgram(fragSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    return p;
  }

  function init(cvs) {
    canvas = cvs;
    gl = cvs.getContext('webgl2') || cvs.getContext('webgl') || cvs.getContext('experimental-webgl');
    if (!gl) return false;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 0,0,  1,-1, 1,0,  -1,1, 0,1,
       1,-1, 1,0, -1,1, 0,1,    1,1, 1,1
    ]), gl.STATIC_DRAW);

    Object.entries(SHADERS).forEach(([name, src]) => {
      const prog = buildProgram(src);
      const posLoc = gl.getAttribLocation(prog, 'a_pos');
      const uvLoc = gl.getAttribLocation(prog, 'a_uv');
      gl.useProgram(prog);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
      programs[name] = prog;
    });

    return true;
  }

  function createTextureFromImage(img) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return tex;
  }

  function applyEffect(tex, effect, time) {
    const axisMap = { horizontal: 0, vertical: 1, both: 2 };
    const key = {
      noise: 'noise', tzatzki: 'tzatzki', tint: 'tint',
      turbulent: 'turbulent', wavewarp: 'wavewarp', kaleidoscope: 'kaleidoscope',
      motiontile: 'motiontile', chromatic: 'chromatic', huesat: 'huesat',
      swirl: 'swirl', halftone: 'halftone', colorbalance: 'colorbalance',
      meshglitch: 'meshglitch', glitch: 'glitch', bloom: 'bloom',
      lightrays: 'lightrays', mirror: 'mirror', pinchbulge: 'pinchbulge'
    }[effect.type];
    if (!key || !programs[key]) return tex;

    const prog = programs[key];
    const fbo = gl.createFramebuffer();
    const outTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, outTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);

    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), time);

    const p = effect.params;
    const unif = (n, v) => {
      const loc = gl.getUniformLocation(prog, n);
      if (loc !== null) {
        if (typeof v === 'number') gl.uniform1f(loc, v);
        else if (Number.isInteger(v)) gl.uniform1i(loc, v);
      }
    };
    const unifI = (n, v) => { const loc = gl.getUniformLocation(prog, n); if (loc !== null) gl.uniform1i(loc, v); };

    if (effect.type === 'noise') { unif('u_intensity', p.intensity); unif('u_animated', p.animated ? 1 : 0); }
    if (effect.type === 'tzatzki') { unif('u_radius', p.radius); unif('u_strength', p.strength); }
    if (effect.type === 'tint') { unif('u_r', p.r); unif('u_g', p.g); unif('u_b', p.b); unif('u_a', p.a); }
    if (effect.type === 'turbulent') { unif('u_amount', p.amount); unif('u_size', p.size); unif('u_speed', p.speed); }
    if (effect.type === 'wavewarp') { unif('u_amplitude', p.amplitude); unif('u_frequency', p.frequency); unif('u_speed', p.speed); unif('u_direction', p.direction); }
    if (effect.type === 'kaleidoscope') { unif('u_segments', p.segments); unif('u_angle', p.angle); }
    if (effect.type === 'motiontile') { unif('u_tilesH', p.tilesH); unif('u_tilesV', p.tilesV); unif('u_phase', p.phase); }
    if (effect.type === 'chromatic') { unif('u_amount', p.amount); unif('u_angle', p.angle); }
    if (effect.type === 'huesat') { unif('u_hue', p.hue); unif('u_saturation', p.saturation); unif('u_lightness', p.lightness); }
    if (effect.type === 'swirl') { unif('u_angle', p.angle); unif('u_radius', p.radius); }
    if (effect.type === 'halftone') { unif('u_dotSize', p.dotSize); unif('u_softness', p.softness); }
    if (effect.type === 'colorbalance') { unif('u_shadows', p.shadows); unif('u_midtones', p.midtones); unif('u_highlights', p.highlights); }
    if (effect.type === 'meshglitch') { unif('u_intensity', p.intensity); unif('u_segments', p.segments); }
    if (effect.type === 'glitch') { unif('u_intensity', p.intensity); unif('u_speed', p.speed); }
    if (effect.type === 'bloom') { unif('u_threshold', p.threshold); unif('u_intensity', p.intensity); unif('u_radius', p.radius); }
    if (effect.type === 'lightrays') { unif('u_intensity', p.intensity); unif('u_decay', p.decay); unif('u_angle', p.angle); }
    if (effect.type === 'mirror') { unifI('u_axis', axisMap[p.axis] ?? 0); }
    if (effect.type === 'pinchbulge') { unif('u_amount', p.amount); unif('u_radius', p.radius); }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    return outTex;
  }

  function renderToScreen(tex) {
    gl.useProgram(programs.passthrough);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(programs.passthrough, 'u_tex'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return { init, createTextureFromImage, applyEffect, renderToScreen, get gl() { return gl; } };
})();

window.VulpixismGL = VulpixismGL;
