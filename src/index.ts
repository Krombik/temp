import { useLayoutEffect, useState } from 'react';
import noop from 'lodash.noop';
import {
  Key,
  NestedMethods,
  NoopRecord,
  SuperState,
  VersionedSuperState,
  _SuperState,
} from './types';

const SET_KEY = Symbol();

const enum RootKey {
  MAP,
  VALUE,
  ERROR,
  PROMISE,
}

type SetMap = Map<typeof SET_KEY, Set<(value: any) => void>>;

type CommonMap = SetMap & Map<Key, NestedMap>;

type NestedMap = CommonMap;

type Root = Map<RootKey.MAP, CommonMap> &
  Map<RootKey.VALUE, any> &
  Map<RootKey.ERROR, any> &
  Map<typeof SET_KEY, Set<(error: any) => void>> &
  Map<RootKey.PROMISE, Promise<any>>;

type StorageMap = Map<Key, Root>;

type Start = 0 | 1;

type Path = Key[] | [any, ...Key[]];

const safeGet = (value: any, path: Path, i: Start) => {
  const l = path.length;

  for (; i < l; i++) {
    const k = path[i];

    if (value && k in value) {
      value = value[k];
    } else {
      return;
    }
  }

  return value;
};

const createRoot = () => {
  const rootMap: NestedMap = new Map();

  rootMap.set(SET_KEY, new Set());

  const root: Root = new Map();

  root.set(RootKey.MAP, rootMap);

  root.set(SET_KEY, new Set());

  return root;
};

const toKey = (value: any) => {
  if (value && Object.getPrototypeOf(value) == Object.prototype) {
    const keys = Object.keys(value).sort();

    let str = '';

    for (let i = keys.length; i--; ) {
      const key = keys[i];

      const child = value[key];

      if (child !== undefined) {
        str += `${key}\v${toKey(child)}\f`;
      }
    }

    return str;
  }

  return '' + value;
};

const handleVersionedStorage = () => {
  const storage: StorageMap = new Map();

  const keyStorage = new Map<string, any>();

  return (key: any) => {
    if (storage.has(key)) {
      return storage.get(key)!;
    }

    if (key && typeof key == 'object') {
      const strKey = toKey(key);

      if (keyStorage.has(strKey)) {
        const prevKey = keyStorage.get(strKey)!;

        if (storage.has(prevKey)) {
          const root = storage.get(key)!;

          storage.delete(prevKey);

          storage.set(key, root);

          return root;
        }
      } else {
        keyStorage.set(strKey, key);
      }
    }

    const root = createRoot();

    storage.set(key, root);

    return root;
  };
};

const alwaysFalse = () => false as const;

const handleMandatoryCheck = (
  prevValue: any,
  nextValue: any,
  storage: NestedMap | undefined | false,
  setFn: () => true
): ((key: Key) => boolean) | false => {
  if (!storage || storage.size < 2) {
    return alwaysFalse;
  }

  let equalList: Set<Key> | false = new Set();

  forEachChild(storage, (key) => {
    const child = storage.get(key)!;

    const newValue = nextValue[key];

    if (handleNotEqual(prevValue[key], newValue, child, setFn)) {
      equalList = false;

      executeSetters(child, newValue);
    } else if (equalList) {
      equalList.add(key);
    }
  });

  return equalList && equalList.has.bind(equalList);
};

const handleNil = (prevValue: any, nextValue: any, storage: NestedMap) => {
  executeSetters(storage, nextValue);

  if (prevValue != nextValue && storage.size > 1) {
    forEachChild(
      storage,
      prevValue == null
        ? (key) => {
            const next = nextValue[key];

            if (next !== undefined) {
              handleNil(undefined, next, storage.get(key)!);
            }
          }
        : (key) => {
            const prev = prevValue[key];

            if (prev !== undefined) {
              handleNil(prev, undefined, storage.get(key)!);
            }
          }
    );
  }
};

const handleNotEqual = (
  prevValue: any,
  nextValue: any,
  storage: NestedMap | undefined | false,
  setFn: () => true
) => {
  if (prevValue === nextValue) {
    return false;
  }

  if (prevValue == null || nextValue == null) {
    setFn();

    if (storage) {
      handleNil(prevValue, nextValue, storage);
    }

    return true;
  }

  const aPrototype = Object.getPrototypeOf(prevValue);

  if (aPrototype != Object.getPrototypeOf(nextValue)) {
    setFn();

    if (storage) {
      executeSetters(storage, nextValue);

      handleMandatoryCheck(prevValue, nextValue, storage, setFn);
    }

    return true;
  }

  if (aPrototype == Object.prototype) {
    const isChecked = handleMandatoryCheck(
      prevValue,
      nextValue,
      storage,
      setFn
    );

    if (!isChecked) {
      return true;
    }

    const aKeys = Object.keys(prevValue);

    let i = aKeys.length;

    if (i != Object.keys(nextValue).length) {
      return setFn();
    }

    const getStorage = storage
      ? (storage.get.bind(storage) as (typeof storage)['get'])
      : alwaysFalse;

    while (i--) {
      const key = aKeys[i];

      if (
        !isChecked(key) &&
        handleNotEqual(prevValue[key], nextValue[key], getStorage(key), setFn)
      ) {
        return true;
      }
    }

    return false;
  }

  if (Array.isArray(prevValue)) {
    const isChecked = handleMandatoryCheck(
      prevValue,
      nextValue,
      storage,
      setFn
    );

    if (!isChecked) {
      return true;
    }

    const l = prevValue.length;

    if (l != nextValue.length) {
      return setFn();
    }

    const getStorage = storage
      ? (storage.get.bind(storage) as (typeof storage)['get'])
      : alwaysFalse;

    for (let i = 0; i < l; i++) {
      if (
        !isChecked(i) &&
        handleNotEqual(prevValue[i], nextValue[i], getStorage(i), setFn)
      ) {
        return true;
      }
    }

    return false;
  }

  if (prevValue instanceof Date) {
    return prevValue.getTime() != nextValue.getTime() && setFn();
  }

  return setFn();
};

const getNewRootValue = (
  prevValue: any,
  nextValue: any,
  path: Path,
  index: number,
  end: number,
  push: (value: any) => any
): any => {
  let newValue;

  if (index < end) {
    const k = path[index++] as Key;

    if (prevValue == null || typeof prevValue != 'object') {
      prevValue = typeof k == 'string' ? {} : [];
    }

    if (Array.isArray(prevValue)) {
      newValue = prevValue.slice();

      newValue[k as number] = getNewRootValue(
        prevValue[k as number],
        nextValue,
        path,
        index,
        end,
        push
      );
    } else {
      newValue = {
        ...prevValue,
        [k]: getNewRootValue(prevValue[k], nextValue, path, index, end, push),
      };
    }
  } else {
    newValue = nextValue;
  }

  push(newValue);

  return newValue;
};

const executeSetters = (storage: SetMap, value: unknown) => {
  const set = storage.get(SET_KEY)!;

  const it = set.values();

  const next = it.next.bind(it);

  for (let i = set.size; i--; ) {
    next().value(value);
  }
};

const forEachChild = (storage: NestedMap, fn: (key: Key) => void) => {
  const it = storage.keys();

  const next = it.next.bind(it);

  next(); // skip set

  for (let i = storage.size - 1; i--; ) {
    fn(next().value);
  }
};

const getMap = (root: Root, path: Path, i: Start) => {
  const l = path.length;

  let parent = root.get(RootKey.MAP)!;

  for (; i < l; i++) {
    const k: Key = path[i];

    if (!parent.has(k)) {
      for (; i < l; i++) {
        const child: NestedMap = new Map();

        child.set(SET_KEY, new Set());

        parent.set(path[i], child);

        parent = child;
      }

      return parent;
    }

    parent = parent.get(k)!;
  }

  return parent;
};

const deleteError = (root: Root) => {
  if (root.delete(RootKey.ERROR)) {
    executeSetters(root, undefined);
  }
};

const deleteValue = (root: Root) => {
  if (root.has(RootKey.VALUE)) {
    safeSet(root, [], 0, undefined);

    root.delete(RootKey.VALUE);
  }
};

const safeSet = (root: Root, path: Key[], start: Start, nextValue: any) => {
  const l = path.length;

  const rootMap = root.get(RootKey.MAP)!;

  const nodesQueue: NestedMap[] = [rootMap];

  const valuesQueue: any[] = [];

  const rootValue = root.get(RootKey.VALUE);

  const prevValue = safeGet(rootValue, path, start);

  let currentNode: NestedMap | undefined = rootMap;

  let isNotUpdated = true;

  if (typeof nextValue == 'function') {
    nextValue = nextValue(prevValue);
  }

  for (let i = start; i < l; i++) {
    const k = path[i] as Key;

    if (currentNode.has(k)) {
      nodesQueue.push((currentNode = currentNode.get(k)!));
    } else {
      currentNode = undefined;

      break;
    }
  }

  if (
    handleNotEqual(prevValue, nextValue, currentNode, (): true => {
      if (isNotUpdated) {
        root.set(
          RootKey.VALUE,
          getNewRootValue(
            rootValue,
            nextValue,
            path,
            start,
            l,
            valuesQueue.push.bind(valuesQueue)
          )
        );

        isNotUpdated = false;
      }

      return true;
    })
  ) {
    for (let i = nodesQueue.length; i--; ) {
      executeSetters(nodesQueue[i], valuesQueue[i]);
    }
  }
};

const getPromise = (root: Root) => {
  if (root.has(RootKey.PROMISE)) {
    return root.get(RootKey.PROMISE)!;
  }

  const valueSet = root.get(RootKey.MAP)!.get(SET_KEY)!;

  const errorSet = root.get(SET_KEY)!;

  const promise = (
    root.has(RootKey.VALUE)
      ? Promise.resolve(root.get(RootKey.VALUE)!)
      : root.has(RootKey.ERROR)
        ? Promise.reject(root.get(RootKey.ERROR))
        : new Promise((res, rej) => {
            const resolve = (value: unknown) => {
              valueSet.delete(resolve);

              errorSet.delete(reject);

              res(value);
            };

            const reject = (error: unknown) => {
              valueSet.delete(resolve);

              errorSet.delete(reject);

              rej(error);
            };

            valueSet.add(resolve);

            errorSet.add(reject);
          })
  ).finally(() => {
    const cleanup = () => {
      valueSet.delete(cleanup);

      errorSet.delete(cleanup);

      root.delete(RootKey.PROMISE);
    };

    valueSet.add(cleanup);

    errorSet.add(cleanup);
  });

  root.set(RootKey.PROMISE, promise);

  return promise;
};

const addToSet = (root: SetMap, cb: (value: unknown) => void) => {
  const set = root.get(SET_KEY)!;

  set.add(cb);

  return () => {
    set.delete(cb);
  };
};

const _set = (root: Root, path: Path, start: Start, value: any) => {
  deleteError(root);

  safeSet(root, path, start, value);
};

const _use = (root: Root, path: Path, start: Start) => {
  const forceRerender = useState<{}>()[1];

  useLayoutEffect(
    () =>
      addToSet(getMap(root, path, start), () => {
        forceRerender({});
      }),
    path
  );

  return safeGet(root.get(RootKey.VALUE), path, start);
};

const _delete = (root: Root) => {
  deleteError(root);

  deleteValue(root);
};

const _setError = (root: Root, error: any) => {
  deleteValue(root);

  root.set(RootKey.ERROR, error);

  executeSetters(root, error);
};

const _useError = (root: Root) => {
  const forceRerender = useState<{}>()[1];

  useLayoutEffect(
    () =>
      addToSet(root, () => {
        forceRerender({});
      }),
    [root]
  );

  return root.get(RootKey.ERROR);
};

const _suspense = (root: Root, path: Path, start: Start) => {
  if (root.has(RootKey.VALUE)) {
    const t = useState<{}>();

    useLayoutEffect(() => {
      const setValue = t[1];

      const forceRerender = () => {
        setValue({});
      };

      const valueSet = getMap(root, path, start).get(SET_KEY)!;

      const errorSet = root.get(SET_KEY)!;

      valueSet.add(forceRerender);

      errorSet.add(forceRerender);

      return () => {
        valueSet.delete(forceRerender);

        errorSet.delete(forceRerender);
      };
    }, path);

    return safeGet(root.get(RootKey.VALUE), path, start);
  }

  throw root.has(RootKey.ERROR) ? root.get(RootKey.ERROR) : getPromise(root);
};

const useNoop = (args: Path) => {
  useState();

  useLayoutEffect(noop, args);
};

const handleUseNoop = (args: Path) => () => {
  useNoop(args);
};

const handleSuperState = (
  root: Root,
  path: Path,
  start: Start
): _SuperState | Pick<_SuperState, NestedMethods> => {
  const nestedMethods: Pick<_SuperState, NestedMethods> = {
    get() {
      return safeGet(root.get(RootKey.VALUE), path, start);
    },
    set(value) {
      _set(root, path, start, value);
    },
    onChange(cb) {
      return addToSet(getMap(root, path, start), cb);
    },
    suspense(disabled) {
      return disabled ? useNoop(path) : _suspense(root, path, start);
    },
    use(disabled) {
      return disabled ? useNoop(path) : _use(root, path, start);
    },
  };

  return path.length > start
    ? nestedMethods
    : {
        ...nestedMethods,
        clear() {
          _delete(root);
        },
        getError() {
          return root.get(RootKey.ERROR);
        },
        getPromise() {
          return getPromise(root);
        },
        onError(cb) {
          return addToSet(root, cb);
        },
        setError(error) {
          _setError(root, error);
        },
        useError(disabled) {
          return disabled ? useNoop([root]) : _useError(root);
        },
      };
};

export const createVersionedState = <V, T, E = any>() => {
  const getRoot = handleVersionedStorage();

  return ((...args: [any, ...Key[]]) => {
    const version = args[0];

    if (version != null) {
      return handleSuperState(getRoot(version), args, 1);
    }

    const useNoop = handleUseNoop(args);

    const nestedMethods = {
      get: noop,
      set: noop,
      onChange: noop,
      suspense: useNoop,
      use: useNoop,
    } as NoopRecord<Pick<_SuperState, NestedMethods>>;

    return args.length > 1
      ? nestedMethods
      : ({
          ...nestedMethods,
          clear: noop,
          getError: noop,
          getPromise: noop,
          onError: noop,
          setError: noop,
          useError: useNoop,
        } as NoopRecord<_SuperState>);
  }) as VersionedSuperState<V, T, E>;
};

export const createSuperState = <T, E = any>() => {
  const root = createRoot();

  return ((path: Key[]) => handleSuperState(root, path, 0)) as SuperState<T, E>;
};
