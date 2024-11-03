import createAsyncState from '../createAsyncState';
import type {
  ControllableLoadableState,
  StateInitializer,
  PollableStateOptions,
} from '../types';
import getPollableStateCreator from '../utils/getPollableStateCreator';

const createPollableState = getPollableStateCreator(createAsyncState) as {
  /** Creates a {@link ControllableLoadableState controllable loadable state} with polling capabilities. */
  <T, E = any>(
    options: PollableStateOptions<T, E>,
    stateInitializer?: StateInitializer<T>
  ): ControllableLoadableState<T, E>;
};

export default createPollableState;
