import { useContext } from 'react';
import type { AnyAsyncState, AsyncState, Falsy } from '../types';
import useNoop from '../utils/useNoop';
import ErrorBoundaryContext from '../utils/ErrorBoundaryContext';
import SuspenseContext from '../utils/SuspenseContext';
import handleSuspense from '../utils/handleSuspense';
import useHandleSuspenseValue from '../utils/useHandleSuspenseValue';
import useForceRerender from 'react-helpful-utils/useForceRerender';

const use = ((
  state: AnyAsyncState<any, any, any[]> | Falsy,
  safeReturn?: boolean
) => {
  const errorBoundaryCtx = useContext(ErrorBoundaryContext);

  const suspenseCtx = useContext(SuspenseContext);

  if (state) {
    const utils = state._internal;

    const err = utils._errorUtils._value;

    const isError = err !== undefined;

    if (isError && !safeReturn) {
      throw err;
    }

    if (utils._value !== undefined || isError) {
      const value = useHandleSuspenseValue(state, useForceRerender());

      return safeReturn ? [value, err] : value;
    }

    throw handleSuspense(state, errorBoundaryCtx, suspenseCtx);
  }

  useNoop();
}) as {
  /**
   * Hook to retrieve the current value of the loaded {@link state}.
   * If the {@link state} isn't loaded, the component using this hook suspends.
   * Ensure the component is wrapped in a <Suspense> component to handle the loading state.
   * If loading fails and {@link safeReturn} is not enabled, an error is thrown.
   */
  <S extends AsyncState<any> | Falsy, SafeReturn extends boolean = false>(
    state: S,
    safeReturn?: SafeReturn
  ): S extends AsyncState<infer T, infer E>
    ? SafeReturn extends false
      ? T
      : Readonly<[value: T, error: undefined] | [value: undefined, error: E]>
    : undefined;
};

export default use;
