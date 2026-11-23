// Interpreter for make.fun's tiny stack ISA v1: mirrors generator/subject/vm.mjs rule for rule.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [opcode, immediate bytes, pops, pushes]
const S = [[0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0], [4, 0, 1, 2], [5, 0, 2, 2],
  [6, 0, 2, 3], [7, 0, 3, 3], [16, 0, 2, 1], [17, 0, 2, 1], [18, 0, 2, 1], [19, 0, 2, 1],
  [20, 0, 2, 1], [21, 0, 2, 1], [22, 0, 2, 1], [23, 0, 1, 1], [24, 0, 2, 1], [25, 0, 2, 1],
  [26, 0, 2, 1], [27, 0, 1, 1], [28, 0, 2, 1], [29, 0, 2, 1], [30, 0, 2, 1], [32, 0, 2, 1],
  [33, 0, 2, 1], [34, 0, 2, 1], [48, 2, 0, 0], [49, 2, 1, 0], [50, 2, 1, 0], [51, 2, 0, 0],
  [52, 0, 0, 0], [64, 0, 1, 1], [65, 0, 2, 0], [80, 0, 1, 0], [81, 0, 1, 0], [82, 0, 0, 1],
  [83, 0, 1, 0]];
const REGS = 256, STACK = 256, CALL_DEPTH = 64, OUT_CAP = 65536, STEP_CAP = 1000000;
const IM = new Int8Array(REGS).fill(-1), PO = new Uint8Array(REGS), PU = new Uint8Array(REGS);
for (const [b, i, p, q] of S) { IM[b] = i; PO[b] = p; PU[b] = q; }

function run(P: Uint8Array, input: Uint8Array) {
  const n = P.length, D = new Int32Array(STACK), C = new Int32Array(CALL_DEPTH), M = new Int32Array(REGS);
  const out = new Uint8Array(OUT_CAP), L = input.length;
  let sp = 0, csp = 0, olen = 0, ip = 0, pc = 0, steps = 0, ex = 0;
  loop: for (;;) {
    if (steps === STEP_CAP) { ex = 10; break; }
    if (pc < 0 || pc >= n) { ex = 9; break; }
    const op = P[pc], imm = IM[op];
    if (imm < 0) { ex = 5; break; }
    if (pc + imm >= n) { ex = 9; break; }
    steps++;
    const nx = pc + 1 + imm, pops = PO[op];
    if (sp < pops) { ex = 2; break; }
    if (sp - pops + PU[op] > STACK) { ex = 3; break; }
    pc = nx;
    switch (op) {
      case 0: ex = 0; break loop;
      case 1: D[sp++] = (P[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = P[nx - 4] | P[nx - 3] << 8 | P[nx - 2] << 16 | P[nx - 1] << 24; break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 16: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = (a + b) | 0; sp--; break; }
      case 17: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = (a - b) | 0; sp--; break; }
      case 18: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = Math.imul(a, b); sp--; break; }
      case 19: {
        const b = D[sp - 1], a = D[sp - 2];
        if (b === 0) { ex = 4; break loop; }
        D[sp - 2] = a === -2147483648 && b === -1 ? a : (a / b) | 0; sp--; break;
      }
      case 20: {
        const b = D[sp - 1], a = D[sp - 2];
        if (b === 0) { ex = 4; break loop; }
        D[sp - 2] = b === -1 ? 0 : (a % b) | 0; sp--; break;
      }
      case 21: {
        const b = D[sp - 1], a = D[sp - 2];
        if (b === 0) { ex = 4; break loop; }
        D[sp - 2] = Math.floor((a >>> 0) / (b >>> 0)) | 0; sp--; break;
      }
      case 22: {
        const b = D[sp - 1], a = D[sp - 2];
        if (b === 0) { ex = 4; break loop; }
        D[sp - 2] = (a >>> 0) % (b >>> 0) | 0; sp--; break;
      }
      case 23: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 24: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = a & b; sp--; break; }
      case 25: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = a | b; sp--; break; }
      case 26: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = a ^ b; sp--; break; }
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 28: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = a << (b & 31); sp--; break; }
      case 29: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = a >> (b & 31); sp--; break; }
      case 30: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = (a >>> (b & 31)) | 0; sp--; break; }
      case 32: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = a === b ? 1 : 0; sp--; break; }
      case 33: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = a < b ? 1 : 0; sp--; break; }
      case 34: { const b = D[sp - 1], a = D[sp - 2]; D[sp - 2] = (a >>> 0) < (b >>> 0) ? 1 : 0; sp--; break; }
      case 48: { const r = ((P[nx - 2] | P[nx - 1] << 8) << 16) >> 16; pc = nx + r; break; }
      case 49: { const r = ((P[nx - 2] | P[nx - 1] << 8) << 16) >> 16; if (D[--sp] === 0) pc = nx + r; break; }
      case 50: { const r = ((P[nx - 2] | P[nx - 1] << 8) << 16) >> 16; if (D[--sp] !== 0) pc = nx + r; break; }
      case 51: {
        if (csp === CALL_DEPTH) { ex = 7; break loop; }
        C[csp++] = nx; pc = P[nx - 2] | P[nx - 1] << 8; break;
      }
      case 52: if (csp === 0) { ex = 8; break loop; } pc = C[--csp]; break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) { ex = 6; break loop; }
        D[sp - 1] = M[a]; break;
      }
      case 65: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) { ex = 6; break loop; }
        M[a] = D[sp - 2]; sp -= 2; break;
      }
      case 80: {
        const s = '' + D[sp - 1];
        if (olen + s.length > OUT_CAP) { ex = 11; break loop; }
        sp--; for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i); break;
      }
      case 81:
        if (olen + 1 > OUT_CAP) { ex = 11; break loop; }
        out[olen++] = D[--sp] & 255; break;
      case 82: D[sp++] = ip < L ? input[ip++] : -1; break;
      default: ex = D[--sp] & 255; break loop;
    }
  }
  return { o: out.subarray(0, olen), ex };
}

// Each case directory holds program.bin and input.bin; the answers go to stdout.bin and exit.txt.
function solveCase(dir: string, outDir: string, id: string) {
  const r = run(new Uint8Array(readFileSync(join(dir, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(dir, id, 'input.bin'))));
  mkdirSync(join(outDir, id), { recursive: true });
  writeFileSync(join(outDir, id, 'stdout.bin'), r.o);
  writeFileSync(join(outDir, id, 'exit.txt'), r.ex + '\n');
}

function main() {
  const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (const d of readdirSync(I, { withFileTypes: true })) {
    if (d.isDirectory()) solveCase(I, O, d.name);
  }
}

main();
