import { BufferGeometry, Float32BufferAttribute, Matrix4 } from "three";
import { expect, test, vi } from "vitest";
import { createScooterRenderer } from "../src/tracking/scooter-gl";

function setupGl() {
  const program = { id: "program" };
  const vertexShader = { id: "vertex shader" };
  const fragmentShader = { id: "fragment shader" };
  const vao = { id: "vertex array" };
  const vertices = { id: "vertex buffer" };
  const elements = { id: "index buffer" };
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    LINK_STATUS: 3,
    ARRAY_BUFFER: 4,
    ELEMENT_ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    UNSIGNED_SHORT: 9,
    createProgram: vi.fn().mockReturnValue(program),
    createShader: vi.fn().mockReturnValueOnce(vertexShader).mockReturnValueOnce(fragmentShader),
    createVertexArray: vi.fn().mockReturnValue(vao),
    createBuffer: vi.fn().mockReturnValueOnce(vertices).mockReturnValueOnce(elements),
    getProgramParameter: vi.fn().mockReturnValue(true),
    getUniformLocation: vi.fn().mockReturnValue({ id: "projection" }),
    isContextLost: vi.fn().mockReturnValue(false),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteBuffer: vi.fn(),
    bindVertexArray: vi.fn(),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    drawElements: vi.fn(),
  };
  const geometry = new BufferGeometry()
    .setIndex([0, 1, 2])
    .setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
    .setAttribute("color", new Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  const createRenderer = () =>
    // @ts-expect-error This recording context implements only methods exercised by the layer.
    createScooterRenderer(gl, geometry);
  return { gl, createRenderer, program, vertexShader, fragmentShader, vao, vertices, elements };
}

test("[CUS-18] releases allocated GL objects when the second mesh buffer fails", () => {
  const { gl, createRenderer, program, vertexShader, fragmentShader, vao, vertices } = setupGl();
  gl.createBuffer.mockReset().mockReturnValueOnce(vertices).mockReturnValueOnce(null);

  expect(createRenderer()).toBeUndefined();
  expect(gl.deleteShader.mock.calls).toEqual([[vertexShader], [fragmentShader]]);
  expect(gl.deleteVertexArray).toHaveBeenCalledExactlyOnceWith(vao);
  expect(gl.deleteBuffer.mock.calls).toEqual([[vertices], [null]]);
  expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(program);
  expect(gl.bindVertexArray).not.toHaveBeenCalled();
  expect(gl.useProgram).not.toHaveBeenCalled();
});

test("[CUS-18] uploads once and releases the shared WebGL bindings after each draw", () => {
  const { gl, createRenderer, program, vao } = setupGl();
  const renderer = createRenderer();
  if (!renderer) throw new Error("Expected the scooter renderer");
  const matrix = new Matrix4().elements;

  for (let frame = 1; frame <= 2; frame++) {
    expect(renderer.draw(matrix)).toBe(true);
    expect(gl.drawElements).toHaveBeenCalledTimes(frame);
    expect(gl.bindVertexArray.mock.calls.slice(-2)).toEqual([[vao], [null]]);
    expect(gl.useProgram.mock.calls.slice(-2)).toEqual([[program], [null]]);
  }
  expect(gl.bufferData).toHaveBeenCalledTimes(2);
  expect(gl.bindBuffer).toHaveBeenLastCalledWith(gl.ARRAY_BUFFER, null);
});
