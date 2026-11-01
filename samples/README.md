# Samples

Fictional documents for trying the app by hand ([`requests.http`](../apps/backend/requests.http)) and for the worker's and the end-to-end tests. Each one covers a different way the worker reads text:

| File                             | What it is                                         | How the worker reads it                             |
| -------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| `employment-contract.pdf`        | 2-page employment contract (English)               | Text layer, locally                                 |
| `heating-invoice-scan.pdf`       | 2-page scanned invoice (German), no text layer     | OCR with Claude                                     |
| `employment-contract-signed.pdf` | Typed contract page, then a scanned signature page | Text layer only: the scanned page stays empty (MVP) |
| `cafe-receipt.jpg`               | Photo of a café receipt (English)                  | OCR with Claude                                     |
| `tenancy-agreement.pdf`          | 2-page tenancy agreement (English)                 | Text layer, locally                                 |
| `deposit-receipt.jpg`            | Photo of the lease's deposit receipt (English)     | OCR with Claude                                     |

`tenancy-agreement.pdf` and `deposit-receipt.jpg` are for trying Ask by hand: with `employment-contract.pdf`, Jane Doe has two contracts and two documents about one flat, so a question has close matches to tell apart.

Tests match on their content, so changing a sample means updating the tests that use it.
