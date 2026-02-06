# Phone UX (One-Line Commands)

Jarvis supports a one-line command interface for phone-to-laptop relay.

## One-line format
```
JARVIS: RUN read_file {"path":"README.md"} --dry-run --explain
JARVIS: SKILLS
JARVIS: STATUS
JARVIS: APPROVALS APPROVE <id> --actor eli
JARVIS: AUDIT TAIL --n 25
```

## Phone → Laptop relay example
1) Phone sends:
```
JARVIS: APPROVALS APPROVE <id> --actor eli
```
2) Laptop runs:
```
jarvis line
```
Paste the line into stdin. The command will be parsed and executed under the same
governance rules as the standard CLI.
