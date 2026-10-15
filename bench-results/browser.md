Chrome headless, Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz (4 logical cores), 16 GB RAM, production build

### Interaction time (median, applied to paint)

| Operation | 1,000 rows | 10,000 rows | 100,000 rows |
| --- | ---: | ---: | ---: |
| Baseline: no change, wait for paint | 29 ms | 30 ms | 29 ms |
| Global search "an" | 29 ms | 41 ms | 294 ms |
| Column filter: Qty > 5 | 29 ms | 37 ms | 185 ms |
| Search + Status + Total filters | 29 ms | 41 ms | 157 ms |
| Errors only | 30 ms | 30 ms | 112 ms |
| Sort by Customer (text) | 34 ms | 86 ms | 693 ms |
| Sort by Total (computed) | 30 ms | 86 ms | 811 ms |
| Sort by Country, then Created | 30 ms | 111 ms | 1066 ms |
| Edit one cell (data sorted by Total) | 29 ms | 78 ms | 1182 ms |
| Scroll top to bottom in 2 s | 50 fps | 41 fps | 33 fps |
| Build CSV for every row | 1.2 ms | 13 ms | 115 ms |
| Import CSV (worker, parse + validate) | 21 ms | 83 ms | 767 ms |

### Virtualization on and off

Times are from navigation start, so they include downloading and starting the app.

| Rows | Virtualization | Data ready | Grid painted | DOM nodes | Scroll |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1,000 | on | 267 ms | 415 ms | 679 | 50 fps, p95 frame 20 ms |
| 10,000 | on | 132 ms | 369 ms | 679 | 41 fps, p95 frame 40 ms |
| 100,000 | on | 297 ms | 1,195 ms | 679 | 33 fps, p95 frame 40 ms |
| 1,000 | off | 92 ms | 1,072 ms | 16,195 | 21 fps, p95 frame 60 ms |
| 10,000 | off | 114 ms | 9,934 ms | 160,084 | 3 fps, p95 frame 660 ms |
