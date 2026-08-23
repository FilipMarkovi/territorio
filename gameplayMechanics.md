# 🎮 Gameplay Mechanics

## 1. Match Initialization & Setup

### HQ Placement Phase
* **Duration:** At the start of a match, players have **15 seconds** to place their Headquarters (HQ).
* **Placement Restrictions:**
  * Cannot be placed on **Water** or **Bedrock** tiles.
  * Must be placed at least **2 tiles away** from any other player's HQ.

---

## 2. Resource Economy & Generation

### The Bell Curve System
Both **Army** and **Gold** generation rates follow a bell curve based on your current Army capacity:
* **Optimal Generation:** Occurs around **50% of Maximum Army capacity**.
* **Penalty:** Operating at either extremely low or maximum Army capacity slows resource generation down by **more than 2x**.

### Gains
All players generate **Army** and **Gold** passivly by a fixed amount + additional gain per second for each owned *connected* tile.

---

## 3. Tile System & Territory Control

### Base Defense
* Every tile has a terrain type determining its **Base Defense** (minimum defense threshold).

### Defense Buffs & Adjacency
* A tile's defense can be boosted by constructing **Forts** or **HQs**.
* **Adjacency Effect:** Forts and HQs increase the defense of their own tile **and all adjacent tiles**.

### Attacking & Capturing
* **Attack only adjecent tiles** You can't attack anything thats not connected to your territory.
* **Army Cost to Attack:** `attack_cost = tile_defense * 5`
* **Capture Duration:** Capturing is not instantaneous. Capture time is calculated based on:
  * Target tile's defense value.
  * Attacking player's Attack Speed modifiers.
  * Size of defender's total territory (if capturing from an active player).
  * *Base Formula:* `attack_time = tile_defense * 1s`
* **Neutral Tile Reward:** Successfully capturing a neutral tile grants instant Gold equal to the tile's **Base Defense**.

### Water Tiles & Amphibious Assaults
* **Impassable Barrier:** Water tiles cannot be captured or walked over directly.
* **Harbor Gateway:** Constructing a **Harbor** unlocks the ability to launch amphibious attacks against any enemy or neutral land tile touching the same body of water.
* **Naval Attack Mechanics:**
  * Launching an attack spawns a **Transport Ship** that travels along the shortest water path from the Harbor to the target tile.
  * **Amphibious Capture Time Formula:**  
    $$\text{attack\_time} = \text{base\_tile\_capture\_time} + (\text{water\_path\_distance} \times 0.5\text{s})$$
  * Capture progress begins immediately upon launching the attack.
  * Destroying the source Harbor cancels all active incoming naval attacks originating from it.
  * Harbor can connect player tiles to the mainland through water body on top of which the Harbor resides
* **Naval attack limitations:**
  * Naval attacks can't target enemys **Harbors** or **HQ** directly.
---

## 4. Structures & Construction

Players can construct buildings to expand their capabilities. Each building has a specific **Cost**, **Build Limit**, **Build Time**, and **Demolish Time**.

| Building | Primary Effect | Capture Behavior |
| :--- | :--- | :--- |
| **Fort** | Increases defense of its tile and all adjacent tiles. | **Destroyed** upon capture. |
| **House** | Increases maximum Army capacity. | **Preserved** if capturer is under building limit; otherwise destroyed. |
| **Barracks** | Provides flat Army generation bonus *(subject to Bell Curve)*. | **Preserved** if capturer is under building limit; otherwise destroyed. |
| **Laboratory** | Unlocks the ability to purchase Buffs and Debuffs. | **Destroyed** upon capture. |
| **Siege Outpost** | Unlocks special attacks. | **Destroyed** upon capture. |

---

## 5. Laboratory Items (Buffs & Debuffs)

### Buffs
* **Attack Speed Buff:** Temporarily increases the player's tile capture speed.
* **Army Boost Buff:** 
  * Instantly triggers a **2x Army Gain Multiplier** for 15 seconds.
  * Followed by a **0.5x Army Gain Multiplier** cooldown penalty for 15 seconds.

### Debuffs
* **Hiperinflation debuff:** Increase all prices by 50% for targeted player for 45s 

---

## 6. Siege Outpost Attacks

### Bombard (50G)
Launch a heavy stone projectile onto the enemy tile destroying any buildings on it and disabling building on that tile permanently

### Plague Bomb
Launch a bomb of plague to spawn an infection source.
* **Plague spreads every 6 seconds from the Plague Source outwards.**
* **Plague targets only player owned tiles, converting them to neutral and destroying any buildings on the tile (exception: HQ).**
* **Plagued tiles have increased defense (Plague Source has additional defense increase).**
* **Plague can spread inside a 3 tile radius (has to be connected to source to spread).**
* **Once there are no more valid tiles to spread to; Plague Source despawns.**

---

## 6. Win & Elimination Conditions

* **Player Elimination:** A player is immediately eliminated from the match when an opponent captures the tile containing their **HQ**.

* **Victory:** The last surviving player remaining in the match is declared the winner or if a player owns 70% of all captureable tiles he will win the match.

* **Rewards:** Players can earn 10 coins for win and 3 coins for loss (only requirement is being alive for longer than 90 seconds in a public match and to be authenticated)