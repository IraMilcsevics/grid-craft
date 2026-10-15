Chrome headless, Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz (4 logical cores), 16 GB RAM, production build

### Interaction time (median, applied to paint)

| Operation | 1,000 rows | 10,000 rows | 100,000 rows |
| --- | ---: | ---: | ---: |
| Baseline: no change, wait for paint | 29 ms | 30 ms | 30 ms |
| Global search "an" | 30 ms | 75 ms | 157 ms |
| Column filter: Qty > 5 | 41 ms | 43 ms | 112 ms |
| Search + Status + Total filters | 30 ms | 60 ms | 160 ms |
| Errors only | 44 ms | 41 ms | 91 ms |
| Sort by Customer (text) | 36 ms | 76 ms | 356 ms |
| Sort by Total (computed) | 30 ms | 63 ms | 473 ms |
| Sort by Country, then Created | 45 ms | 106 ms | 700 ms |
| Edit one cell (data sorted by Total) | 30 ms | 39 ms | 486 ms |
| Scroll top to bottom in 2 s | 50 fps | 44 fps | 36 fps |
| Build CSV for every row | 1.2 ms | 11 ms | 116 ms |
| Import CSV (worker, parse + validate) | 19 ms | 77 ms | 737 ms |

### Virtualization on and off

Times are from navigation start, so they include downloading and starting the app.

| Rows | Virtualization | Data ready | Grid painted | DOM nodes | Scroll |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1,000 | on | 271 ms | 402 ms | 686 | 50 fps, p95 frame 20 ms |
| 10,000 | on | 153 ms | 328 ms | 686 | 44 fps, p95 frame 40 ms |
| 100,000 | on | 304 ms | 874 ms | 686 | 36 fps, p95 frame 40 ms |
| 1,000 | off | 104 ms | 1,034 ms | 16,202 | 22 fps, p95 frame 60 ms |
| 10,000 | off | 125 ms | 7,547 ms | 160,091 | 3 fps, p95 frame 640 ms |
