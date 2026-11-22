import type { BufferGeometry } from "three";

const vertexSource = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 color;
uniform mat4 projection;
out vec3 shadedColor;
void main() {
  shadedColor = color;
  gl_Position = projection * vec4(position, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec3 shadedColor;
out vec4 outputColor;
void main() {
  outputColor = vec4(shadedColor, 1.0);
}`;

function linkProgram(gl: WebGL2RenderingContext) {
  const resources: [WebGLProgram | null, WebGLShader | null, WebGLShader | null] = [
    gl.createProgram(),
    gl.createShader(gl.VERTEX_SHADER),
    gl.createShader(gl.FRAGMENT_SHADER),
  ];
  const [program, vertex, fragment] = resources;
  let linked = false;
  try {
    if (!program || !vertex || !fragment) return undefined;
    gl.shaderSource(vertex, vertexSource);
    gl.shaderSource(fragment, fragmentSource);
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
    if (linked) return program;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!linked) gl.deleteProgram(program);
  }
}

function interleave(geometry: BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const colors = geometry.getAttribute("color");
  const data = new Float32Array(positions.count * 6);
  for (let index = 0; index < positions.count; index++) {
    const offset = index * 6;
    data[offset] = positions.getX(index);
    data[offset + 1] = positions.getY(index);
    data[offset + 2] = positions.getZ(index);
    data[offset + 3] = colors.getX(index);
    data[offset + 4] = colors.getY(index);
    data[offset + 5] = colors.getZ(index);
  }
  return data;
}

export function createScooterRenderer(gl: WebGL2RenderingContext, geometry: BufferGeometry) {
  const indices = geometry.getIndex()?.array;
  if (!(indices instanceof Uint16Array)) return undefined;
  const program = linkProgram(gl);
  if (!program) return undefined;
  const projection = gl.getUniformLocation(program, "projection");
  const buffers: [WebGLVertexArrayObject | null, WebGLBuffer | null, WebGLBuffer | null] = [
    gl.createVertexArray(),
    gl.createBuffer(),
    gl.createBuffer(),
  ];
  const [vao, vertices, elements] = buffers;
  const dispose = () => {
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(vertices);
    gl.deleteBuffer(elements);
    gl.deleteProgram(program);
  };
  if (!projection || !vao || !vertices || !elements) {
    dispose();
    return undefined;
  }
  let vertexData: Float32Array | undefined = interleave(geometry);
  return {
    draw(matrix: number[]) {
      if (gl.isContextLost()) return false;
      gl.bindVertexArray(vao);
      gl.useProgram(program);
      try {
        if (vertexData) {
          gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
          gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(0);
          gl.enableVertexAttribArray(1);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, null);
          vertexData = undefined;
        }
        gl.uniformMatrix4fv(projection, false, matrix);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        return true;
      } finally {
        // MapLibre supplies the shared blend/depth state and restores its own bindings.
        gl.bindVertexArray(null);
        gl.useProgram(null);
      }
    },
    dispose,
  };
}
