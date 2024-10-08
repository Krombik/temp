import { useLayoutEffect, useMemo } from 'react';
import { AnyAsyncState, AsyncState, State } from '../types';
import getValue from '../getValue';
import onValueChange from '../onValueChange';
import useForceRerender from 'react-helpful-utils/useForceRerender';
import handleListeners from '../utils/handleListeners';
import simpleIsEqual from '../utils/simpleIsEqual';

const useMappedValue = ((
  state: AnyAsyncState<any>,
  mapper: (value: any, isLoaded?: boolean, error?: any) => any,
  isEqual: (nextValue: any, prevValue: any) => boolean = simpleIsEqual
) => {
  const { isLoaded } = state;

  const error = mapper.length > 2 && state.error;

  const deps = [state._internal, state._path && state._path.join('.')] as const;

  const forceRerender = useForceRerender();

  const mappedValueRef = useMemo(
    () => ({
      _value: mapper(
        getValue(state),
        isLoaded && getValue(isLoaded),
        error && getValue(error)
      ),
    }),
    deps
  );

  useLayoutEffect(
    () =>
      handleListeners([
        onValueChange(state, (value) => {
          if (!error || value !== undefined || getValue(error) === undefined) {
            const nextValue = mapper(value, isLoaded && getValue(isLoaded));

            if (!isEqual(nextValue, mappedValueRef._value)) {
              mappedValueRef._value = nextValue;

              forceRerender();
            }
          }
        }),
        'load' in state && !state._withoutLoading && state.load(),
        error &&
          onValueChange(error, (err) => {
            if (err !== undefined || getValue(state) === undefined) {
              const nextValue = mapper(undefined, err !== undefined, err);

              if (!isEqual(nextValue, mappedValueRef._value)) {
                mappedValueRef._value = nextValue;

                forceRerender();
              }
            }
          }),
      ]),
    deps
  );

  return mappedValueRef._value;
}) as {
  /**
   * Hook to {@link mapper map} and retrieve a value from a {@link state}.
   * @param mapper - Function that maps the value.
   * @param isEqual - Optional comparison function to determine equality of the mapped values.
   */
  <T, V, E = any>(
    state: AsyncState<T, E>,
    mapper: (
      value: T | undefined,
      isLoaded: boolean,
      error: E | undefined
    ) => V,
    isEqual?: (nextMappedValue: V, prevMappedValue: V) => boolean
  ): V;
  /**
   * Hook to {@link mapper map} and retrieve a value from a {@link state}.
   * @param mapper - Function that maps the value.
   * @param isEqual - Optional comparison function to determine equality of the mapped values.
   */
  <T, V>(
    state: State<T>,
    mapper: (value: T) => V,
    isEqual?: (nextMappedValue: V, prevMappedValue: V) => boolean
  ): V;
};

export default useMappedValue;
