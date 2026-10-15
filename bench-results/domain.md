Node v22.19.0, median of 7 runs

| Operation                             | 1,000 rows | 10,000 rows | 100,000 rows |
| ------------------------------------- | ---------: | ----------: | -----------: |
| Generate rows                         |     3.1 ms |       20 ms |       215 ms |
| Validate every cell                   |     2.5 ms |       23 ms |       230 ms |
| Build CSV                             |     1.9 ms |       20 ms |       214 ms |
| Parse CSV text                        |     1.3 ms |       22 ms |       232 ms |
| Parse + import with validation report |     6.7 ms |       59 ms |       642 ms |
