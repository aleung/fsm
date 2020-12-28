/* tslint:disable */   // TODO: tmp for dev

import * as _ from 'lodash/fp';

/**
 * Entry action and exit action on a state.
 *
 * The function must internally handle exception or promise rejection.
 * For example, send an error event to the FSM to trigger state transition.
 * The FSM just ignore any error returned and contine.
 */
interface StateActions {
  /**
   * @param fromState If current status is the init state, `__init__` will be passed on init.
   * @param context
   */
  onEntry?(fromState: string, event?: Event): Promise<void> | void;
  onExit?(toState: string, event?: Event): Promise<void> | void;
}

interface Event {
  name: string,
  data?: any,
}

interface Machine {
  readonly currentState: string,
  init(): Promise<void>,
  send(event: Event): Promise<void>,
}

interface TransitionObjectDefinition {
  to: string,
  action?: (event: Event) => Promise<void> | void,
}

type TransitionDefinition = string | TransitionObjectDefinition;

interface TransitionsDefinition {
  transitions?: {
    default?: TransitionDefinition,
    [eventName: string]: TransitionDefinition | undefined,
  }
}

interface StateDefinition extends TransitionsDefinition {
  actions?: StateActions,
}

type MachineDefinition = TransitionsDefinition & {
  initialState: string,
  states: {
    [name: string]: StateDefinition
  }
}


class Fsm implements Machine {

  private readonly INIT_STATE = '__init__';
  private currentStateName = this.INIT_STATE;

  constructor(private readonly definition: MachineDefinition) {
    validate(definition);  // it may throw error
  }

  private stateByName(name: string): StateDefinition {
    return this.definition.states[name];
  }

  private async transiteTo(targetStateName: string, event?: Event, transitionAction?: () => Promise<void> | void): Promise<void> {
    console.log(`${this.currentStateName} -> ${targetStateName}`);

    if (this.currentState !== this.INIT_STATE) {
      const currentState = this.stateByName(this.currentState);
      if (currentState.actions?.onExit) {
        try {
          await currentState.actions.onExit(targetStateName, event);
        } catch (error) {
          // just ignore
          // TODO: log
        }
      }
      if (transitionAction) {
        try {
          await transitionAction();
        } catch (error) {
          // just ignore
          // TODO: log
        }
      }
    }

    const fromState = this.currentStateName;
    this.currentStateName = targetStateName;

    const toState = this.stateByName(targetStateName);
    if (toState.actions?.onEntry) {
      try {
        await toState.actions.onEntry(fromState, event);
      } catch (error) {
        // just ignore
        // TODO: log
      }
    }
  }

  private getMatchedTransition(definition: TransitionsDefinition, event: string): string | TransitionObjectDefinition | undefined {
    return definition.transitions?.[event] ?? definition.transitions?.default;
  }

  async init(): Promise<void> {
    await this.transiteTo(this.definition.initialState);
  }

  /**
   * Send an event to the machine to trigger state transition and execute actions if defined.
   *
   * Action failure will never cause promise rejection. If this function throws error it should be program error.
   *
   * @param event
   */
  async send(event: Event): Promise<void> {
    if (this.currentState === this.INIT_STATE) {
      throw new Error('Machine has not been initialized');
    }
    const transitionInState = this.getMatchedTransition(this.stateByName(this.currentState), event.name);
    const transition = transitionInState ?? this.getMatchedTransition(this.definition, event.name);
    console.log(`on event ${event.name}, transite to`, transitionInState, transition);
    switch (typeof transition) {
      case 'undefined':
        throw Error(`Event ${event.name} is invalid in state ${this.currentState}`);
      case 'string':
        await this.transiteTo(transition, event);
        break;
      default:
        await this.transiteTo(transition.to, event, transition.action ? () => transition.action!(event) : undefined);
    }
  }

  get currentState(): string {
    return this.currentStateName;
  }
}


function validate(definition: MachineDefinition): void {
  // Collect all referred state names
  const getStateRefsInTransitions: (d: TransitionsDefinition) => string[] =
    _.pipe([
      _.get('transitions'),
      _.values,
      _.map(_.cond([
        [_.isString, _.identity],
        [_.stubTrue, _.get('to')]
      ])),
    ]);
  const stateRefs = _.uniq(_.flatten([
    definition.initialState,
    _.flatMap(getStateRefsInTransitions)(_.values(definition.states)),
    getStateRefsInTransitions(definition),
  ]));

  // All referenced states must be defined
  const invalidRefs = _.difference(stateRefs, _.keys(definition.states));
  if (invalidRefs.length > 0) {
    throw new Error(`No definition for states: ${invalidRefs}`);
  }
}

// Hide the `Fsm` class inside this module
function create(definition: MachineDefinition): Machine {
  return new Fsm(definition);
}

export {
  Event,
  Machine,
  MachineDefinition,
  create,
};

