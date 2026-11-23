# make.fun's tiny stack ISA, version 1

The instruction set every tiny-stack-vm-01 program is written in. `vm.mjs` beside this file is make.fun's reference
VM: the generator runs every drawn program on it, and its output and exit code are the expected answer. Where this
page and `vm.mjs` could be read two ways, `vm.mjs` is the rule.

## The machine

- **Program**: the bytes of `program.bin`, at most 65,535 of them. `pc` starts at 0.
- **Values**: 32-bit two's-complement integers. Every arithmetic result wraps modulo 2^32 (so `MUL` is the low 32
  bits of the full product, never a rounded floating-point product).
- **Data stack**: at most 256 values, empty at the start.
- **Call stack**: at most 64 return addresses, empty at the start.
- **Memory**: 256 words, addresses 0 to 255, every word 0 at the start.
- **Input**: the bytes of `input.bin`, read in order by `IN`.
- **Output**: the bytes the program writes (`PRINT`, `PUTC`), at most 65,536 of them.
- **Steps**: at most 1,000,000 instructions are executed.

## One step

In this order:

1. If 1,000,000 instructions have already been executed: trap 10.
2. If `pc` is outside the program (below 0, or at or past its length): trap 9.
3. The byte at `pc` is the opcode; a byte no opcode below names: trap 5.
4. If the opcode's immediate does not fit before the end of the program: trap 9.
5. The instruction is executed (it counts as one step). Its stack needs are checked first: fewer values than it pops,
   trap 2; more than 256 values once it has pushed, trap 3. Then its own traps, then its effect. `pc` moves past the
   instruction and its immediate unless the instruction jumps.

Immediates are little-endian. In the stack pictures below the rightmost value is the top: `( a b -- r )` pops `b`
(the top), then `a`, and pushes `r`.

## The opcodes

| Byte | Name | Immediate | Stack | Effect |
|---|---|---|---|---|
| 00 | HALT | | | exit with code 0 |
| 01 | PUSH8 | 1 byte | `( -- v )` | the byte as a signed 8-bit number, sign-extended (0xFF is -1) |
| 02 | PUSH32 | 4 bytes | `( -- v )` | the four bytes as a signed 32-bit number |
| 03 | POP | | `( a -- )` | |
| 04 | DUP | | `( a -- a a )` | |
| 05 | SWAP | | `( a b -- b a )` | |
| 06 | OVER | | `( a b -- a b a )` | |
| 07 | ROT | | `( a b c -- b c a )` | |
| 10 | ADD | | `( a b -- a+b )` | wraps |
| 11 | SUB | | `( a b -- a-b )` | wraps |
| 12 | MUL | | `( a b -- a*b )` | the low 32 bits of the exact product |
| 13 | DIV | | `( a b -- a/b )` | signed, truncated toward zero; b = 0 traps 4; -2147483648 / -1 is -2147483648 |
| 14 | MOD | | `( a b -- a%b )` | signed remainder, the sign of `a`; b = 0 traps 4; x % -1 is 0 |
| 15 | DIVU | | `( a b -- r )` | a and b read as unsigned 32-bit; the quotient, read back as signed; b = 0 traps 4 |
| 16 | MODU | | `( a b -- r )` | the unsigned remainder, read back as signed; b = 0 traps 4 |
| 17 | NEG | | `( a -- -a )` | wraps: -(-2147483648) is -2147483648 |
| 18 | AND | | `( a b -- a&b )` | bitwise |
| 19 | OR | | `( a b -- a\|b )` | bitwise |
| 1A | XOR | | `( a b -- a^b )` | bitwise |
| 1B | NOT | | `( a -- ~a )` | bitwise complement |
| 1C | SHL | | `( a b -- r )` | a shifted left by (b AND 31) bits |
| 1D | SHR | | `( a b -- r )` | a shifted right by (b AND 31), arithmetic (the sign bit copied in) |
| 1E | SHRU | | `( a b -- r )` | a shifted right by (b AND 31), logical (zeros in), read back as signed |
| 20 | EQ | | `( a b -- f )` | 1 if a = b, else 0 |
| 21 | LT | | `( a b -- f )` | 1 if a < b as signed numbers, else 0 |
| 22 | LTU | | `( a b -- f )` | 1 if a < b as unsigned numbers, else 0 |
| 30 | JMP | 2 bytes, signed | | pc = (address of the next instruction) + offset |
| 31 | JZ | 2 bytes, signed | `( v -- )` | jump as JMP if v = 0 |
| 32 | JNZ | 2 bytes, signed | `( v -- )` | jump as JMP if v is not 0 |
| 33 | CALL | 2 bytes, unsigned | | 64 return addresses held already traps 7; else push the next instruction's address and set pc to the immediate |
| 34 | RET | | | an empty call stack traps 8; else pc = the popped return address |
| 40 | LOAD | | `( addr -- v )` | addr outside 0 to 255 traps 6; else memory[addr] |
| 41 | STORE | | `( v addr -- )` | addr outside 0 to 255 traps 6; else memory[addr] = v |
| 50 | PRINT | | `( v -- )` | writes v in decimal ASCII: a leading `-` when negative, no other sign, no padding, no newline |
| 51 | PUTC | | `( v -- )` | writes one byte, v AND 255 |
| 52 | IN | | `( -- b )` | the next input byte, 0 to 255; -1 once the input is used up (and every time after) |
| 53 | EXIT | | `( v -- )` | exit with code v AND 255 (so -1 exits 255) |

A jump's target is not checked when it jumps: a target outside the program traps 9 at the next step (rule 2). A
program that runs past its last byte traps 9 too: falling off the end is never a halt.

## Traps

A trap ends the program at once. Its exit code is the trap's code; the output it wrote before the trap is kept, and
the instruction that trapped writes nothing.

| Code | Trap |
|---|---|
| 2 | stack underflow: an instruction pops more values than the stack holds |
| 3 | stack overflow: an instruction would leave more than 256 values |
| 4 | division by zero: DIV, MOD, DIVU or MODU with b = 0 |
| 5 | unknown opcode |
| 6 | memory address outside 0 to 255 (LOAD or STORE) |
| 7 | call stack overflow: CALL with 64 return addresses held |
| 8 | RET with an empty call stack |
| 9 | pc outside the program, or an immediate cut off by the program's end |
| 10 | step limit: 1,000,000 instructions executed and the program has not ended |
| 11 | output limit: a PRINT or PUTC that would take the output past 65,536 bytes (it writes none of its bytes) |

## What an entry writes

For each program `/input/<id>/program.bin` (with its input `/input/<id>/input.bin`), an entry writes
`/output/<id>/stdout.bin`, exactly the bytes the program wrote, and `/output/<id>/exit.txt`, its exit code in
decimal (0 to 255; a newline after it is allowed). A program that halts, exits or traps has an exit code; the entry
writes it either way.

## The rules most implementations get wrong

Wrapping 32-bit multiplication; -2147483648 / -1 and -2147483648 % -1; the sign of a remainder; DIVU, MODU and LTU on
negative values; shift counts of 32 or more and negative counts (only the low 5 bits count); SHR against SHRU;
PUSH8's sign extension; EXIT's low byte; every trap's code, and that a trap keeps the output written before it; the
step and output limits; falling off the end; IN after the end of the input.
