import { PlayerID, Unit, UnitType } from "./Game";
import { GameMap, TileRef } from "./GameMap";
import { UnitView } from "./GameView";

export type UnitPredicate = (value: {
  unit: Unit | UnitView;
  distSquared: number;
}) => boolean;

export class UnitGrid {
  private grid: Map<UnitType, Set<Unit | UnitView>>[][];
  private readonly cellSize = 100;

  constructor(private gm: GameMap) {
    this.grid = Array(Math.ceil(gm.height() / this.cellSize))
      .fill(null)
      .map(() =>
        Array(Math.ceil(gm.width() / this.cellSize))
          .fill(null)
          .map(() => new Map<UnitType, Set<Unit | UnitView>>()),
      );
  }

  // Get grid coordinates from pixel coordinates
  private getGridCoords(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }

  // Add a unit to the grid
  addUnit(unit: Unit | UnitView) {
    const tile = unit.tile();
    const [gridX, gridY] = this.getGridCoords(this.gm.x(tile), this.gm.y(tile));

    if (this.isValidCell(gridX, gridY)) {
      const unitSet = this.grid[gridY][gridX].get(unit.type());
      if (unitSet !== undefined) {
        unitSet.add(unit);
      } else {
        this.grid[gridY][gridX].set(
          unit.type(),
          new Set<Unit | UnitView>([unit]),
        );
      }
    }
  }

  // Remove a unit from the grid
  removeUnit(unit: Unit | UnitView) {
    const tile = unit.tile();
    this.removeUnitByTile(unit, tile);
  }

  removeUnitByTile(unit: Unit | UnitView, tile: TileRef) {
    const [gridX, gridY] = this.getGridCoords(this.gm.x(tile), this.gm.y(tile));

    if (this.isValidCell(gridX, gridY)) {
      const unitSet = this.grid[gridY][gridX].get(unit.type());
      if (unitSet !== undefined) {
        unitSet.delete(unit);
      }
    }
  }

  /**
   * Move an unit to its new cell if it changed
   */
  updateUnitCell(unit: Unit | UnitView) {
    const newTile = unit.tile();
    const oldTile = unit.lastTile();
    const [gridX, gridY] = this.getGridCoords(
      this.gm.x(oldTile),
      this.gm.y(oldTile),
    );
    const [newGridX, newGridY] = this.getGridCoords(
      this.gm.x(newTile),
      this.gm.y(newTile),
    );
    if (gridX !== newGridX || gridY !== newGridY) {
      this.removeUnitByTile(unit, oldTile);
      this.addUnit(unit);
    }
  }

  private isValidCell(gridX: number, gridY: number): boolean {
    return (
      gridX >= 0 &&
      gridX < this.grid[0].length &&
      gridY >= 0 &&
      gridY < this.grid.length
    );
  }

  // Compute the exact cells in range of tile
  private getCellsInRange(tile: TileRef, range: number) {
    const x = this.gm.x(tile);
    const y = this.gm.y(tile);
    const cellSize = this.cellSize;
    const [gridX, gridY] = this.getGridCoords(x, y);
    const startGridX = Math.max(
      0,
      gridX - Math.ceil((range - (x % cellSize)) / cellSize),
    );
    const endGridX = Math.min(
      this.grid[0].length - 1,
      gridX + Math.ceil((range - (cellSize - (x % cellSize))) / cellSize),
    );
    const startGridY = Math.max(
      0,
      gridY - Math.ceil((range - (y % cellSize)) / cellSize),
    );
    const endGridY = Math.min(
      this.grid.length - 1,
      gridY + Math.ceil((range - (cellSize - (y % cellSize))) / cellSize),
    );

    return { startGridX, endGridX, startGridY, endGridY };
  }

  private squaredDistanceFromTile(
    unit: Unit | UnitView,
    tile: TileRef,
  ): number {
    const x = this.gm.x(tile);
    const y = this.gm.y(tile);
    const tileX = this.gm.x(unit.tile());
    const tileY = this.gm.y(unit.tile());
    const dx = tileX - x;
    const dy = tileY - y;
    const distSquared = dx * dx + dy * dy;
    return distSquared;
  }

  // Get all units within range of a point
  // Returns [unit, distanceSquared] pairs for efficient filtering
  nearbyUnits(
    tile: TileRef,
    searchRange: number,
    types: readonly UnitType[] | UnitType,
    predicate?: UnitPredicate,
  ): Array<{ unit: Unit | UnitView; distSquared: number }> {
    const nearby: Array<{ unit: Unit | UnitView; distSquared: number }> = [];
    const { startGridX, endGridX, startGridY, endGridY } = this.getCellsInRange(
      tile,
      searchRange,
    );
    const rangeSquared = searchRange * searchRange;
    const typeSet = Array.isArray(types) ? new Set(types) : new Set([types]);
    for (let cy = startGridY; cy <= endGridY; cy++) {
      for (let cx = startGridX; cx <= endGridX; cx++) {
        for (const type of typeSet) {
          const unitSet = this.grid[cy][cx].get(type);
          if (unitSet === undefined) continue;
          for (const unit of unitSet) {
            if (!unit.isActive()) continue;
            const distSquared = this.squaredDistanceFromTile(unit, tile);
            if (distSquared > rangeSquared) continue;
            const value = { unit, distSquared };
            if (predicate !== undefined && !predicate(value)) continue;
            nearby.push(value);
          }
        }
      }
    }
    return nearby;
  }

  // Return true if it finds an owned specific unit in range
  hasUnitNearby(
    tile: TileRef,
    searchRange: number,
    type: UnitType,
    playerId: PlayerID,
  ): boolean {
    const { startGridX, endGridX, startGridY, endGridY } = this.getCellsInRange(
      tile,
      searchRange,
    );
    const rangeSquared = searchRange * searchRange;
    for (let cy = startGridY; cy <= endGridY; cy++) {
      for (let cx = startGridX; cx <= endGridX; cx++) {
        const unitSet = this.grid[cy][cx].get(type);
        if (unitSet === undefined) continue;
        for (const unit of unitSet) {
          if (unit.owner().id() === playerId && unit.isActive()) {
            const distSquared = this.squaredDistanceFromTile(unit, tile);
            if (distSquared <= rangeSquared) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
}
