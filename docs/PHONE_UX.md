# Phone UX (One-Line Commands)

SAFA supports a one-line command interface for phone-to-laptop relay.

## One-line format
```
SAFA: RUN read_file {"path":"README.md"} --dry-run --explain
SAFA: SKILLS
SAFA: STATUS
SAFA: APPROVALS APPROVE <id> --actor eli
SAFA: AUDIT TAIL --n 25
```

## Phone → Laptop relay example
1) Phone sends:
```
SAFA: APPROVALS APPROVE <id> --actor eli
```
2) Laptop runs:
```
safa line
```
Paste the line into stdin. The command will be parsed and executed under the same
governance rules as the standard CLI.
