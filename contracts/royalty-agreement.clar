;; RoyaltyAgreement.clar
;; Core smart contract for managing royalty agreements in PharmaRoyalties+
;; Handles creation, updates, and enforcement of royalty agreements for
;; pharmaceutical innovations, with milestone-based payouts, multi-party
;; signatures, tokenization of shares, and integration points.

;; Constants
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INVALID-PERCENTAGE u101)
(define-constant ERR-AGREEMENT-EXISTS u102)
(define-constant ERR-NO-AGREEMENT u103)
(define-constant ERR-INVALID-MILESTONE u104)
(define-constant ERR-INSUFFICIENT-SIGNATURES u105)
(define-constant ERR-ALREADY-SIGNED u106)
(define-constant ERR-INVALID-TOKEN-AMOUNT u107)
(define-constant ERR-PAUSED u108)
(define-constant ERR-INVALID-INNOVATION u109)
(define-constant ERR-MILESTONE-NOT-MET u110)
(define-constant ERR-PAYOUT-ALREADY-TRIGGERED u111)
(define-constant ERR-INVALID-SIGNATURE-THRESHOLD u112)
(define-constant MAX-CONTRIBUTORS u20)
(define-constant MIN-SIGNATURE-THRESHOLD u51) ;; 51% for multi-sig
(define-constant MAX-MILESTONES u10)
(define-constant TOKEN_DECIMALS u6) ;; For tokenized shares

;; Data Variables
(define-data-var contract-paused bool false)
(define-data-var admin principal tx-sender)

;; Data Maps
(define-map agreements
  { innovation-hash: (buff 32) }
  {
    contributors: (list 20 { contributor: principal, percentage: uint }),
    milestones: (list 10 { id: uint, description: (string-utf8 200), required: bool, achieved: bool, payout-percentage: uint }),
    total-percentage: uint,
    tokenized: bool,
    token-supply: uint,
    signatures-required: uint,
    signed-by: (list 20 principal),
    last-updated: uint
  }
)

(define-map contributor-shares
  { innovation-hash: (buff 32), contributor: principal }
  {
    share-percentage: uint,
    tokenized-amount: uint,
    received-payouts: uint,
    pending-payouts: uint
  }
)

(define-map milestone-status
  { innovation-hash: (buff 32), milestone-id: uint }
  {
    achieved-at: (optional uint),
    verified-by: (optional principal),
    payout-triggered: bool
  }
)

(define-map tokenized-shares
  { innovation-hash: (buff 32), holder: principal }
  { amount: uint, locked-until: uint }
)

;; Traits for Integration
(define-trait innovation-registry-trait
  (
    (get-innovation-owner ((buff 32)) (response principal uint))
    (is-innovation-registered ((buff 32)) (response bool uint))
  )
)

;; Private Functions
(define-private (calculate-total-percentage (contributors (list 20 { contributor: principal, percentage: uint })))
  (fold + (map (lambda (c) (get percentage c)) contributors) u0)
)

(define-private (validate-percentages (total uint))
  (if (is-eq total u100)
    (ok true)
    (err ERR-INVALID-PERCENTAGE)
  )
)

(define-private (check-admin (caller principal))
  (if (is-eq caller (var-get admin))
    (ok true)
    (err ERR-UNAUTHORIZED)
  )
)

(define-private (check-paused)
  (if (var-get contract-paused)
    (err ERR-PAUSED)
    (ok true)
  )
)

(define-private (verify-innovation (hash (buff 32)) (registry <innovation-registry-trait>))
  (match (contract-call? registry is-innovation-registered hash)
    success (if success (ok true) (err ERR-INVALID-INNOVATION))
    error (err error)
  )
)

(define-private (get-innovation-owner (hash (buff 32)) (registry <innovation-registry-trait>))
  (contract-call? registry get-innovation-owner hash)
)

(define-private (set-contributor-shares (contrib { contributor: principal, percentage: uint }) (hash (buff 32)))
  (begin
    (map-set contributor-shares
      { innovation-hash: hash, contributor: (get contributor contrib) }
      {
        share-percentage: (get percentage contrib),
        tokenized-amount: u0,
        received-payouts: u0,
        pending-payouts: u0
      }
    )
    hash
  )
)

(define-private (init-milestone-status (ms { id: uint, description: (string-utf8 200), required: bool, achieved: bool, payout-percentage: uint }) (hash (buff 32)))
  (begin
    (map-set milestone-status
      { innovation-hash: hash, milestone-id: (get id ms) }
      {
        achieved-at: (if (get achieved ms) (some block-height) none),
        verified-by: none,
        payout-triggered: false
      }
    )
    hash
  )
)

(define-private (verify-multi-sig (hash (buff 32)) (num-contribs uint))
  (let
    (
      (agreement (unwrap! (map-get? agreements { innovation-hash: hash }) (err ERR-NO-AGREEMENT)))
      (signed-count (len (get signed-by agreement)))
      (required (get signatures-required agreement))
    )
    (if (>= (* signed-count u100) (* required num-contribs))
      (ok true)
      (err ERR-INSUFFICIENT-SIGNATURES)
    )
  )
)

(define-private (check-milestones-achieved
  (agreement
    {
      contributors: (list 20 { contributor: principal, percentage: uint }),
      milestones: (list 10 { id: uint, description: (string-utf8 200), required: bool, achieved: bool, payout-percentage: uint }),
      total-percentage: uint,
      tokenized: bool,
      token-supply: uint,
      signatures-required: uint,
      signed-by: (list 20 principal),
      last-updated: uint
    }
  )
  (hash (buff 32)))
  (let
    (
      (required-ms (filter (lambda (ms) (get required ms)) (get milestones agreement)))
    )
    (if (is-eq (len required-ms) u0)
      (ok true)
      (fold
        (lambda (ms acc)
          (and acc
            (is-some
              (get achieved-at
                (unwrap! (map-get? milestone-status { innovation-hash: hash, milestone-id: (get id ms) })
                  (err ERR-INVALID-MILESTONE)))))
        )
        required-ms
        true
      )
    )
  )
)

(define-private (calculate-pending-payouts (contrib { contributor: principal, percentage: uint }) (ctx { hash: (buff 32), revenue: uint }))
  (let
    (
      (hash (get hash ctx))
      (revenue (get revenue ctx))
      (contributor (get contributor contrib))
      (percentage (get percentage contrib))
      (share (unwrap! (map-get? contributor-shares { innovation-hash: hash, contributor: contributor }) (err ERR-NO-AGREEMENT)))
      (payout (/ (* revenue percentage) u100))
    )
    (map-set contributor-shares
      { innovation-hash: hash, contributor: contributor }
      (merge share { pending-payouts: (+ (get pending-payouts share) payout) })
    )
    ctx
  )
)

(define-private (distribute-tokenized-shares (contrib { contributor: principal, percentage: uint }) (ctx { hash: (buff 32), supply: uint }))
  (let
    (
      (hash (get hash ctx))
      (supply (get supply ctx))
      (contributor (get contributor contrib))
      (amount (/ (* supply (get percentage contrib)) u100))
      (share (unwrap! (map-get? contributor-shares { innovation-hash: hash, contributor: contributor }) (err ERR-NO-AGREEMENT)))
    )
    (map-set tokenized-shares
      { innovation-hash: hash, holder: contributor }
      { amount: amount, locked-until: (+ block-height u1000) }
    )
    (map-set contributor-shares
      { innovation-hash: hash, contributor: contributor }
      (merge share { tokenized-amount: amount })
    )
    ctx
  )
)

;; Public Functions
(define-public (create-agreement
  (innovation-hash (buff 32))
  (contributors (list 20 { contributor: principal, percentage: uint }))
  (milestones (list 10 { id: uint, description: (string-utf8 200), required: bool, achieved: bool, payout-percentage: uint }))
  (signatures-required uint)
  (registry <innovation-registry-trait>))
  (begin
    (try! (check-paused))
    (try! (verify-innovation innovation-hash registry))
    (asserts! (<= signatures-required (* (len contributors) u100)) (err ERR-INVALID-SIGNATURE-THRESHOLD))
    (match (get-innovation-owner innovation-hash registry)
      owner (if (is-eq tx-sender owner)
              (let
                (
                  (total-pct (calculate-total-percentage contributors))
                )
                (try! (validate-percentages total-pct))
                (asserts! (is-none (map-get? agreements { innovation-hash: innovation-hash })) (err ERR-AGREEMENT-EXISTS))
                (map-set agreements
                  { innovation-hash: innovation-hash }
                  {
                    contributors: contributors,
                    milestones: milestones,
                    total-percentage: total-pct,
                    tokenized: false,
                    token-supply: u0,
                    signatures-required: signatures-required,
                    signed-by: (list tx-sender),
                    last-updated: block-height
                  }
                )
                (fold set-contributor-shares contributors innovation-hash)
                (fold init-milestone-status milestones innovation-hash)
                (print { event: "agreement-created", hash: innovation-hash, creator: tx-sender, contributors: contributors })
                (ok true)
              )
              (err ERR-UNAUTHORIZED)
            )
      error (err error)
    )
  )
)

(define-public (update-agreement
  (innovation-hash (buff 32))
  (new-contributors (list 20 { contributor: principal, percentage: uint }))
  (new-milestones (list 10 { id: uint, description: (string-utf8 200), required: bool, achieved: bool, payout-percentage: uint }))
  (registry <innovation-registry-trait>))
  (begin
    (try! (check-paused))
    (let
      (
        (agreement-opt (map-get? agreements { innovation-hash: innovation-hash }))
      )
      (match agreement-opt
        agreement (begin
                    (try! (verify-multi-sig innovation-hash (len new-contributors)))
                    (let
                      (
                        (total-pct (calculate-total-percentage new-contributors))
                      )
                      (try! (validate-percentages total-pct))
                      (map-set agreements
                        { innovation-hash: innovation-hash }
                        (merge agreement {
                          contributors: new-contributors,
                          milestones: new-milestones,
                          total-percentage: total-pct,
                          last-updated: block-height,
                          signed-by: (list)
                        })
                      )
                      (fold set-contributor-shares new-contributors innovation-hash)
                      (fold init-milestone-status new-milestones innovation-hash)
                      (print { event: "agreement-updated", hash: innovation-hash, updater: tx-sender })
                      (ok true)
                    )
                  )
        (err ERR-NO-AGREEMENT)
      )
    )
  )
)

(define-public (sign-agreement (innovation-hash (buff 32)))
  (let
    (
      (agreement-opt (map-get? agreements { innovation-hash: innovation-hash }))
    )
    (match agreement-opt
      agreement (if (is-some (index-of? (map (lambda (c) (get contributor c)) (get contributors agreement)) tx-sender))
                  (if (is-none (index-of? (get signed-by agreement) tx-sender))
                    (begin
                      (map-set agreements
                        { innovation-hash: innovation-hash }
                        (merge agreement { signed-by: (append (get signed-by agreement) tx-sender) })
                      )
                      (print { event: "agreement-signed", hash: innovation-hash, signer: tx-sender })
                      (ok true)
                    )
                    (err ERR-ALREADY-SIGNED)
                  )
                  (err ERR-UNAUTHORIZED)
                )
      (err ERR-NO-AGREEMENT)
    )
  )
)

(define-public (achieve-milestone (innovation-hash (buff 32)) (milestone-id uint) (verifier principal))
  (let
    (
      (agreement (unwrap! (map-get? agreements { innovation-hash: innovation-hash }) (err ERR-NO-AGREEMENT)))
      (ms-status-opt (map-get? milestone-status { innovation-hash: innovation-hash, milestone-id: milestone-id }))
    )
    (match ms-status-opt
      ms-status (if (is-none (get achieved-at ms-status))
                  (begin
                    (map-set milestone-status
                      { innovation-hash: innovation-hash, milestone-id: milestone-id }
                      (merge ms-status { achieved-at: (some block-height), verified-by: (some verifier) })
                    )
                    (print { event: "milestone-achieved", hash: innovation-hash, milestone-id: milestone-id, verifier: verifier })
                    (ok true)
                  )
                  (err ERR-MILESTONE-NOT-MET)
                )
      (err ERR-INVALID-MILESTONE)
    )
  )
)

(define-public (trigger-payout (innovation-hash (buff 32)) (revenue-amount uint) (payment-distributor principal))
  (begin
    (try! (check-paused))
    (let
      (
        (agreement (unwrap! (map-get? agreements { innovation-hash: innovation-hash }) (err ERR-NO-AGREEMENT)))
      )
      (try! (check-milestones-achieved agreement innovation-hash))
      (fold calculate-pending-payouts (get contributors agreement) { hash: innovation-hash, revenue: revenue-amount })
      (print { event: "payout-triggered", hash: innovation-hash, amount: revenue-amount, distributor: payment-distributor })
      (ok true)
    )
  )
)

(define-public (tokenize-shares (innovation-hash (buff 32)) (total-supply uint))
  (begin
    (try! (check-paused))
    (asserts! (> total-supply u0) (err ERR-INVALID-TOKEN-AMOUNT))
    (let
      (
        (agreement-opt (map-get? agreements { innovation-hash: innovation-hash }))
      )
      (match agreement-opt
        agreement (if (not (get tokenized agreement))
                    (begin
                      (map-set agreements
                        { innovation-hash: innovation-hash }
                        (merge agreement { tokenized: true, token-supply: total-supply })
                      )
                      (fold distribute-tokenized-shares (get contributors agreement) { hash: innovation-hash, supply: total-supply })
                      (print { event: "shares-tokenized", hash: innovation-hash, supply: total-supply })
                      (ok true)
                    )
                    (err ERR-ALREADY-SIGNED)
                  )
        (err ERR-NO-AGREEMENT)
      )
    )
  )
)

(define-public (transfer-tokenized-share (innovation-hash (buff 32)) (amount uint) (recipient principal))
  (begin
    (try! (check-paused))
    (asserts! (> amount u0) (err ERR-INVALID-TOKEN-AMOUNT))
    (let
      (
        (sender-share (unwrap! (map-get? tokenized-shares { innovation-hash: innovation-hash, holder: tx-sender }) (err ERR-UNAUTHORIZED)))
      )
      (if (>= (get amount sender-share) amount)
        (begin
          (map-set tokenized-shares
            { innovation-hash: innovation-hash, holder: tx-sender }
            (merge sender-share { amount: (- (get amount sender-share) amount) })
          )
          (let
            (
              (recip-share (default-to { amount: u0, locked-until: u0 } (map-get? tokenized-shares { innovation-hash: innovation-hash, holder: recipient })))
            )
            (map-set tokenized-shares
              { innovation-hash: innovation-hash, holder: recipient }
              (merge recip-share { amount: (+ (get amount recip-share) amount) })
            )
          )
          (print { event: "token-transfer", hash: innovation-hash, from: tx-sender, to: recipient, amount: amount })
          (ok true)
        )
        (err ERR-INVALID-TOKEN-AMOUNT)
      )
    )
  )
)

;; Admin Functions
(define-public (pause-contract)
  (begin
    (try! (check-admin tx-sender))
    (var-set contract-paused true)
    (print { event: "contract-paused", admin: tx-sender })
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (try! (check-admin tx-sender))
    (var-set contract-paused false)
    (print { event: "contract-unpaused", admin: tx-sender })
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (try! (check-admin tx-sender))
    (var-set admin new-admin)
    (print { event: "admin-changed", new-admin: new-admin })
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-agreement (innovation-hash (buff 32)))
  (map-get? agreements { innovation-hash: innovation-hash })
)

(define-read-only (get-contributor-share (innovation-hash (buff 32)) (contributor principal))
  (map-get? contributor-shares { innovation-hash: innovation-hash, contributor: contributor })
)

(define-read-only (get-milestone-status (innovation-hash (buff 32)) (milestone-id uint))
  (map-get? milestone-status { innovation-hash: innovation-hash, milestone-id: milestone-id })
)

(define-read-only (get-tokenized-share (innovation-hash (buff 32)) (holder principal))
  (map-get? tokenized-shares { innovation-hash: innovation-hash, holder: holder })
)

(define-read-only (is-paused)
  (var-get contract-paused)
)

(define-read-only (get-admin)
  (var-get admin)
)
