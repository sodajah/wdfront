import { NukeExecution } from "../../../src/core/execution/NukeExecution";
import { SAMLauncherExecution } from "../../../src/core/execution/SAMLauncherExecution";
import { SpawnExecution } from "../../../src/core/execution/SpawnExecution";
import { UpgradeStructureExecution } from "../../../src/core/execution/UpgradeStructureExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../../../src/core/game/Game";
import { setup } from "../../util/Setup";
import { constructionExecution, executeTicks } from "../../util/utils";

let game: Game;
let attacker: Player;
let defender: Player;
let far_defender: Player;
let middle_defender: Player;

describe("SAM", () => {
  beforeEach(async () => {
    game = await setup("big_plains", {
      infiniteGold: true,
      instantBuild: true,
    });
    const defender_info = new PlayerInfo(
      "defender_id",
      PlayerType.Human,
      null,
      "defender_id",
    );
    const middle_defender_info = new PlayerInfo(
      "middle_defender_id",
      PlayerType.Human,
      null,
      "middle_defender_id",
    );
    const far_defender_info = new PlayerInfo(
      "far_defender_id",
      PlayerType.Human,
      null,
      "far_defender_id",
    );
    const attacker_info = new PlayerInfo(
      "attacker_id",
      PlayerType.Human,
      null,
      "attacker_id",
    );
    game.addPlayer(defender_info);
    game.addPlayer(middle_defender_info);
    game.addPlayer(far_defender_info);
    game.addPlayer(attacker_info);

    game.addExecution(
      new SpawnExecution(game.player(defender_info.id).info(), game.ref(1, 1)),
      new SpawnExecution(
        game.player(middle_defender_info.id).info(),
        game.ref(50, 1),
      ),
      new SpawnExecution(
        game.player(far_defender_info.id).info(),
        game.ref(199, 1),
      ),
      new SpawnExecution(game.player(attacker_info.id).info(), game.ref(7, 7)),
    );

    while (game.inSpawnPhase()) {
      game.executeNextTick();
    }

    attacker = game.player("attacker_id");
    defender = game.player("defender_id");
    middle_defender = game.player("middle_defender_id");
    far_defender = game.player("far_defender_id");

    constructionExecution(game, attacker, 7, 7, UnitType.MissileSilo);
  });

  test("one sam should take down one nuke", async () => {
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));

    // Sam will only target bombs it can destroy before it reaches its target
    const nuke = attacker.buildUnit(UnitType.AtomBomb, game.ref(1, 1), {
      targetTile: game.ref(3, 1),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(2, 1), targetable: true },
        { tile: game.ref(3, 1), targetable: true },
      ],
    });
    executeTicks(game, 3);

    expect(attacker.units(UnitType.AtomBomb)).toHaveLength(0);
  });

  test("sam should only get one nuke at a time", async () => {
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));
    attacker.buildUnit(UnitType.AtomBomb, game.ref(2, 1), {
      targetTile: game.ref(3, 1),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(2, 1), targetable: true },
        { tile: game.ref(3, 1), targetable: true },
      ],
    });
    attacker.buildUnit(UnitType.AtomBomb, game.ref(1, 2), {
      targetTile: game.ref(1, 3),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(1, 2), targetable: true },
        { tile: game.ref(1, 3), targetable: true },
      ],
    });
    expect(attacker.units(UnitType.AtomBomb)).toHaveLength(2);

    executeTicks(game, 3);

    expect(attacker.units(UnitType.AtomBomb)).toHaveLength(1);
  });

  test("sam should cooldown as long as configured", async () => {
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});

    game.addExecution(new SAMLauncherExecution(defender, null, sam));
    expect(sam.isInCooldown()).toBeFalsy();
    const nuke = attacker.buildUnit(UnitType.AtomBomb, game.ref(1, 1), {
      targetTile: game.ref(1, 3),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(2, 1), targetable: true },
        { tile: game.ref(3, 1), targetable: true },
      ],
    });

    executeTicks(game, 3);

    expect(nuke.isActive()).toBeFalsy();

    for (let i = 0; i < game.config().SAMCooldown() - 3; i++) {
      game.executeNextTick();
      expect(sam.isInCooldown()).toBeTruthy();
    }

    executeTicks(game, 2);

    expect(sam.isInCooldown()).toBeFalsy();
  });

  test("two sams should not target twice same nuke", async () => {
    const sam1 = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam1));
    const sam2 = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 2), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam2));
    const nuke = attacker.buildUnit(UnitType.AtomBomb, game.ref(1, 1), {
      targetTile: game.ref(1, 3),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(1, 2), targetable: true },
        { tile: game.ref(1, 3), targetable: true },
      ],
    });

    executeTicks(game, 3);

    expect(nuke.isActive()).toBeFalsy();
    expect([sam1, sam2].filter((s) => s.isInCooldown())).toHaveLength(1);
  });

  test("SAMs should target close to launch site", async () => {
    const targetDistance = 199;
    // Close SAM: should intercept the nuke
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));

    const nukeExecution = new NukeExecution(
      UnitType.AtomBomb,
      attacker,
      game.ref(targetDistance, 1),
      null,
    );
    game.addExecution(nukeExecution);
    // Long distance nuke: compute the proper number of ticks
    const ticksToExecute = Math.ceil(
      targetDistance / game.config().defaultNukeSpeed() + 1,
    );
    executeTicks(game, ticksToExecute);

    expect(nukeExecution.isActive()).toBeFalsy();
    expect(sam.isInCooldown()).toBeTruthy();
  });

  test("SAMs should target only bombs aimed at nearby targets if not close to launch site", async () => {
    const targetDistance = 199;
    // Middle SAM: should not intercept the nuke
    const sam1 = middle_defender.buildUnit(
      UnitType.SAMLauncher,
      game.ref(50, 1),
      {},
    );
    game.addExecution(new SAMLauncherExecution(defender, null, sam1));

    // Far SAM: Should intercept the nuke. Use the far_defender so the SAM can be built
    const sam2 = far_defender.buildUnit(
      UnitType.SAMLauncher,
      game.ref(targetDistance, 1),
      {},
    );
    game.addExecution(new SAMLauncherExecution(far_defender, null, sam2));

    const nukeExecution = new NukeExecution(
      UnitType.AtomBomb,
      attacker,
      game.ref(targetDistance, 1),
      null,
    );
    game.addExecution(nukeExecution);
    // Long distance nuke: compute the proper number of ticks
    const ticksToExecute = Math.ceil(
      targetDistance / game.config().defaultNukeSpeed() + 1,
    );
    executeTicks(game, ticksToExecute);
    expect(nukeExecution.isActive()).toBeFalsy();
    expect(sam1.isInCooldown()).toBeFalsy();
    expect(sam2.isInCooldown()).toBeTruthy();
  });

  test("SAM should have increased level after upgrade", async () => {
    defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    expect(defender.units(UnitType.SAMLauncher)[0].level()).toEqual(1);

    const upgradeStructureExecution = new UpgradeStructureExecution(
      defender,
      defender.units(UnitType.SAMLauncher)[0].id(),
    );
    game.addExecution(upgradeStructureExecution);
    executeTicks(game, 2);

    expect(defender.units(UnitType.SAMLauncher)[0].level()).toEqual(2);
  });
});
