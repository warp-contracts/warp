import {Trie} from "@ethereumjs/trie";
import {TrieLevel} from "../../cache/impl/TrieLevel";
import {Level} from "level";
import {DEFAULT_LEVEL_DB_LOCATION} from "../../core/WarpFactory";
import fs from "fs";
import {SmartWeaveGlobal} from "../../legacy/smartweave-global";
import Arweave from "arweave";
import {DefaultEvaluationOptions} from "../../core/modules/StateEvaluator";

describe('KV database', () => {
  describe('with the Trie implementation', () => {
    afterAll(() => {
      fs.rmSync(`${DEFAULT_LEVEL_DB_LOCATION}/kv/KV_TRIE_TEST`, {recursive: true});
    });

    const sut = new Trie({
      db: new TrieLevel(new Level(`${DEFAULT_LEVEL_DB_LOCATION}/kv/KV_TRIE_TEST`))
    });

    it('should set values', async () => {
      await sut.put(Buffer.from("foo"), Buffer.from("bar"));
      await sut.put(Buffer.from("one"), Buffer.from("1"));
      await sut.put(Buffer.from("two"), Buffer.from("2"));

      expect((await (sut.get(Buffer.from("foo")))).toString()).toEqual("bar");
      expect((await (sut.get(Buffer.from("one")))).toString()).toEqual("1");
      expect((await (sut.get(Buffer.from("two")))).toString()).toEqual("2");
    });

    it('should set values in batch', async () => {
      await sut.batch([
        {
          type: 'put',
          key: Buffer.from("4"),
          value: Buffer.from("four")
        },
        {
          type: 'put',
          key: Buffer.from("5"),
          value: Buffer.from("five")
        },
        {
          type: 'put',
          key: Buffer.from("6"),
          value: Buffer.from("six")
        }
      ]);

      expect((await (sut.get(Buffer.from("4")))).toString()).toEqual("four");
      expect((await (sut.get(Buffer.from("5")))).toString()).toEqual("five");
      expect((await (sut.get(Buffer.from("6")))).toString()).toEqual("six");
    });
  });

  describe('with the SmartWeave Global KV implementation', () => {
    afterAll(() => {
      fs.rmSync(`${DEFAULT_LEVEL_DB_LOCATION}/kv/KV_TRIE_TEST_SW_GLOBAL`, {recursive: true});
    });

    const arweave = Arweave.init({});

    const db = new Trie({
      db: new TrieLevel(new Level(`${DEFAULT_LEVEL_DB_LOCATION}/kv/KV_TRIE_TEST_SW_GLOBAL`))
    });

    const sut = new SmartWeaveGlobal(arweave, {id: "a", owner: ""}, new DefaultEvaluationOptions(), db);

    it('should set values', async () => {
      await sut.kv.put("foo", "bar");
      await sut.kv.put("one", "1");
      await sut.kv.put("two", "2");
      await sut.kv.commit();

      await sut.kv.put("three", "3");
      await sut.kv.commit();

      await sut.kv.put("33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA", "23111222");
      await sut.kv.commit();

      expect((await (sut.kv.get("foo")))).toEqual("bar");
      expect((await (sut.kv.get("one")))).toEqual("1");
      expect((await (sut.kv.get("two")))).toEqual("2");
      expect((await (sut.kv.get("three")))).toEqual("3");
      expect((await (sut.kv.get("33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA")))).toEqual("23111222");
    });
  });

});
