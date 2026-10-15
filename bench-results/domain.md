Node v22.19.0, median of 7 runs

| Operation                             | 1,000 rows | 10,000 rows | 100,000 rows |
| ------------------------------------- | ---------: | ----------: | -----------: |
| Generate rows                         |     3.0 ms |       20 ms |       225 ms |
| Validate every cell                   |     3.1 ms |       31 ms |       298 ms |
| Build CSV                             |     1.9 ms |       21 ms |       231 ms |
| Parse CSV text                        |     1.5 ms |       22 ms |       236 ms |
| Parse + import with validation report |     7.1 ms |       69 ms |       692 ms |
