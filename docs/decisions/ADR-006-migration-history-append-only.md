---
id: ADR-006
title: migration history append-only
status: proposed
date: 2026-07-24
owners:
  - repository-maintainers
supersedes:
  - none
---
# ADR-006 migration history append-only

## 背景

過去migrationの未deploy証跡をrepository差分だけで判定できず、編集例外がreviewerの主観になります。

## 決定

`main`に存在するmigration SQL、snapshot、journalをappend-onlyとします。修正は新しいrepair migrationで行います。

## 理由

全environmentで同じ履歴を再現し、適用済みDBとの分岐を防ぐためです。

## 検討した代替案

- 未deploy証跡があれば編集: 証跡sourceと承認が複雑
- migration squash: active production databaseとの整合が難しい

## 結果

Repair migrationが増える場合があります。Historyは読みやすいsemantic tagを使います。

## 強制方法

- CIでmainとの差分を検査
- existing migrationのM/Dをfail
- new migrationだけAを許可

## 検証

- history check
- fresh/upgrade suite
- schema drift check
