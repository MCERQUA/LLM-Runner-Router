import fs from 'fs/promises';
import path from 'path';

export class PersistentMap {
  constructor(filePath) {
    this.filePath = filePath;
    this.map = new Map();
  }

  async load() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const obj = JSON.parse(data);
      this.map = new Map(Object.entries(obj));
    } catch (err) {
      if (err.code === 'ENOENT') {
        await this.save();
      } else {
        throw err;
      }
    }
  }

  async save() {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const obj = Object.fromEntries(this.map);
    await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2));
  }

  get size() {
    return this.map.size;
  }

  get(key) {
    return this.map.get(key);
  }

  set(key, value) {
    this.map.set(key, value);
    this.save().catch(() => {});
    return this;
  }

  delete(key) {
    const res = this.map.delete(key);
    this.save().catch(() => {});
    return res;
  }

  clear() {
    this.map.clear();
    this.save().catch(() => {});
  }

  values() {
    return this.map.values();
  }

  entries() {
    return this.map.entries();
  }

  has(key) {
    return this.map.has(key);
  }

  [Symbol.iterator]() {
    return this.map[Symbol.iterator]();
  }
}

export default PersistentMap;
