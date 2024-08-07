import { useContext, useLayoutEffect, useState } from 'react';
import type {
  AnyAsyncState,
  AnyLoadableAsyncState,
  Falsy,
  NOT_LOADED,
} from '../types';
import useNoop from '../utils/useNoop';
import UseContext from '../utils/UseContext';
import onValueChange from '../onValueChange';
import onError from '../onError';
import getValue from '../getValue';
import getPromise from '../getPromise';
import { RootKey } from '../utils/constants';

const use = ((state: AnyLoadableAsyncState | Falsy) => {
  const ctx = useContext(UseContext);

  if (state) {
    const root = state.r;

    if (root.has(RootKey.VALUE)) {
      const t = useState<{}>();

      useLayoutEffect(() => {
        const setValue = t[1];

        const forceRerender = () => {
          setValue({});
        };

        const unlistenValue = onValueChange(state, forceRerender);

        const unlistenError = onError(state, forceRerender);

        let unregister: () => void;

        if (root.has(RootKey.LOAD)) {
          if (ctx.has(root)) {
            unregister = ctx.get(root)!;

            ctx.delete(root);
          } else {
            unregister = root.get(RootKey.LOAD)!(state);
          }
        }

        return () => {
          unlistenValue();

          unlistenError();

          unregister && unregister();
        };
      }, [root, state._p && state._p.join('.')]);

      return getValue(state);
    }

    if (root.has(RootKey.ERROR)) {
      throw root.get(RootKey.ERROR);
    }

    if (root.has(RootKey.LOAD) && !ctx.has(root)) {
      ctx.set(root, root.get(RootKey.LOAD)!(state));
    }

    throw getPromise({ r: root });
  }

  useNoop();
}) as {
  <S extends AnyAsyncState | Falsy>(
    state: S
  ): S extends AnyAsyncState<infer T>
    ? Exclude<T, typeof NOT_LOADED>
    : undefined;
};

export default use;
