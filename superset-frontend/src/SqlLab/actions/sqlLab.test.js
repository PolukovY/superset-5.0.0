/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import sinon from 'sinon';
import fetchMock from 'fetch-mock';
import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import { waitFor } from '@testing-library/react';
import * as actions from 'src/SqlLab/actions/sqlLab';
import { LOG_EVENT } from 'src/logger/actions';
import {
  defaultQueryEditor,
  query,
  initialState,
  queryId,
} from 'src/SqlLab/fixtures';
import { SupersetClient, isFeatureEnabled } from '@superset-ui/core';
import { ADD_TOAST } from 'src/components/MessageToasts/actions';
import { ToastType } from '../../components/MessageToasts/types';

const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

jest.mock('nanoid', () => ({
  nanoid: () => 'abcd',
}));

afterAll(() => {
  jest.resetAllMocks();
});

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  isFeatureEnabled: jest.fn(),
}));

describe('getUpToDateQuery', () => {
  test('should return the up to date query editor state', () => {
    const outOfUpdatedQueryEditor = {
      ...defaultQueryEditor,
      schema: null,
      sql: 'SELECT ...',
    };
    const queryEditor = {
      ...defaultQueryEditor,
      sql: 'SELECT * FROM table',
    };
    const state = {
      sqlLab: {
        queryEditors: [queryEditor],
        unsavedQueryEditor: {},
      },
    };
    expect(actions.getUpToDateQuery(state, outOfUpdatedQueryEditor)).toEqual(
      queryEditor,
    );
  });
});

describe('async actions', () => {
  const mockBigNumber = '9223372036854775807';
  const queryEditor = {
    ...defaultQueryEditor,
    id: 'abcd',
    autorun: false,
    latestQueryId: null,
    sql: 'SELECT *\nFROM\nWHERE',
    name: 'Untitled Query 1',
  };

  let dispatch;

  beforeEach(() => {
    dispatch = sinon.spy();
  });

  afterEach(fetchMock.resetHistory);

  const fetchQueryEndpoint = 'glob:*/api/v1/sqllab/results/*';
  fetchMock.get(
    fetchQueryEndpoint,
    JSON.stringify({ data: mockBigNumber, query: { sqlEditorId: 'dfsadfs' } }),
  );

  const runQueryEndpoint = 'glob:*/api/v1/sqllab/execute/';
  fetchMock.post(runQueryEndpoint, `{ "data": ${mockBigNumber} }`);

  describe('saveQuery', () => {
    const saveQueryEndpoint = 'glob:*/api/v1/saved_query/';
    fetchMock.post(saveQueryEndpoint, { results: { json: {} } });

    const makeRequest = () => {
      const request = actions.saveQuery(query, queryId);
      return request(dispatch, () => initialState);
    };

    it('posts to the correct url', () => {
      expect.assertions(1);

      const store = mockStore(initialState);
      return store.dispatch(actions.saveQuery(query, queryId)).then(() => {
        expect(fetchMock.calls(saveQueryEndpoint)).toHaveLength(1);
      });
    });

    it('posts the correct query object', () => {
      const store = mockStore(initialState);
      return store.dispatch(actions.saveQuery(query, queryId)).then(() => {
        const call = fetchMock.calls(saveQueryEndpoint)[0];
        const formData = JSON.parse(call[1].body);
        const mappedQueryToServer = actions.convertQueryToServer(query);

        Object.keys(mappedQueryToServer).forEach(key => {
          expect(formData[key]).toBeDefined();
        });
      });
    });

    it('calls 3 dispatch actions', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        expect(dispatch.callCount).toBe(2);
      });
    });

    it('calls QUERY_EDITOR_SAVED after making a request', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        expect(dispatch.args[0][0].type).toBe(actions.QUERY_EDITOR_SAVED);
      });
    });

    it('onSave calls QUERY_EDITOR_SAVED and QUERY_EDITOR_SET_TITLE', () => {
      expect.assertions(1);

      const store = mockStore(initialState);
      const expectedActionTypes = [
        actions.QUERY_EDITOR_SAVED,
        actions.QUERY_EDITOR_SET_TITLE,
      ];
      return store.dispatch(actions.saveQuery(query)).then(() => {
        expect(store.getActions().map(a => a.type)).toEqual(
          expectedActionTypes,
        );
      });
    });
  });

  describe('formatQuery', () => {
    const formatQueryEndpoint = 'glob:*/api/v1/sqllab/format_sql/';
    const expectedSql = 'SELECT 1';
    fetchMock.post(formatQueryEndpoint, { result: expectedSql });

    test('posts to the correct url', async () => {
      const store = mockStore(initialState);
      store.dispatch(actions.formatQuery(query, queryId));
      await waitFor(() =>
        expect(fetchMock.calls(formatQueryEndpoint)).toHaveLength(1),
      );
      expect(store.getActions()[0].type).toBe(actions.QUERY_EDITOR_SET_SQL);
      expect(store.getActions()[0].sql).toBe(expectedSql);
    });
  });

  describe('fetchQueryResults', () => {
    const makeRequest = () => {
      const store = mockStore(initialState);
      const request = actions.fetchQueryResults(query);
      return request(dispatch, store.getState);
    };

    it('makes the fetch request', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        expect(fetchMock.calls(fetchQueryEndpoint)).toHaveLength(1);
      });
    });

    it('calls requestQueryResults', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        expect(dispatch.args[0][0].type).toBe(actions.REQUEST_QUERY_RESULTS);
      });
    });

    it.skip('parses large number result without losing precision', () =>
      makeRequest().then(() => {
        expect(fetchMock.calls(fetchQueryEndpoint)).toHaveLength(1);
        expect(dispatch.callCount).toBe(2);
        expect(dispatch.getCall(1).lastArg.results.data.toString()).toBe(
          mockBigNumber,
        );
      }));

    it('calls querySuccess on fetch success', () => {
      expect.assertions(1);

      const store = mockStore({});
      const expectedActionTypes = [
        actions.REQUEST_QUERY_RESULTS,
        actions.QUERY_SUCCESS,
      ];
      return store.dispatch(actions.fetchQueryResults(query)).then(() => {
        expect(store.getActions().map(a => a.type)).toEqual(
          expectedActionTypes,
        );
      });
    });

    it('calls queryFailed on fetch error', () => {
      expect.assertions(1);

      fetchMock.get(
        fetchQueryEndpoint,
        { throws: { message: 'error text' } },
        { overwriteRoutes: true },
      );

      const store = mockStore({});
      const expectedActionTypes = [
        actions.REQUEST_QUERY_RESULTS,
        actions.QUERY_FAILED,
      ];
      return store.dispatch(actions.fetchQueryResults(query)).then(() => {
        expect(store.getActions().map(a => a.type)).toEqual(
          expectedActionTypes,
        );
      });
    });
  });

  describe('runQuery without query params', () => {
    const makeRequest = () => {
      const request = actions.runQuery(query);
      return request(dispatch, () => initialState);
    };

    it('makes the fetch request', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        expect(fetchMock.calls(runQueryEndpoint)).toHaveLength(1);
      });
    });

    it('calls startQuery', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        expect(dispatch.args[0][0].type).toBe(actions.START_QUERY);
      });
    });

    it.skip('parses large number result without losing precision', () =>
      makeRequest().then(() => {
        expect(fetchMock.calls(runQueryEndpoint)).toHaveLength(1);
        expect(dispatch.callCount).toBe(2);
        expect(dispatch.getCall(1).lastArg.results.data.toString()).toBe(
          mockBigNumber,
        );
      }));

    it('calls querySuccess on fetch success', () => {
      expect.assertions(1);

      const store = mockStore({});
      const expectedActionTypes = [actions.START_QUERY, actions.QUERY_SUCCESS];
      const { dispatch } = store;
      const request = actions.runQuery(query);
      return request(dispatch, () => initialState).then(() => {
        expect(store.getActions().map(a => a.type)).toEqual(
          expectedActionTypes,
        );
      });
    });

    it('calls queryFailed on fetch error and logs the error details', () => {
      expect.assertions(2);

      fetchMock.post(
        runQueryEndpoint,
        {
          throws: {
            message: 'error text',
            timeout: true,
            statusText: 'timeout',
          },
        },
        { overwriteRoutes: true },
      );

      const store = mockStore({});
      const expectedActionTypes = [
        actions.START_QUERY,
        LOG_EVENT,
        actions.QUERY_FAILED,
      ];
      const { dispatch } = store;
      const request = actions.runQuery(query);
      return request(dispatch, () => initialState).then(() => {
        const actions = store.getActions();
        expect(actions.map(a => a.type)).toEqual(expectedActionTypes);
        expect(actions[1].payload.eventData.issue_codes).toEqual([1000, 1001]);
      });
    });
  });

  describe('runQuery with query params', () => {
    const { location } = window;

    beforeAll(() => {
      delete window.location;
      window.location = new URL('http://localhost/sqllab/?foo=bar');
    });

    afterAll(() => {
      delete window.location;
      window.location = location;
    });

    const makeRequest = () => {
      const request = actions.runQuery(query);
      return request(dispatch, () => initialState);
    };

    it('makes the fetch request', async () => {
      const runQueryEndpointWithParams =
        'glob:*/api/v1/sqllab/execute/?foo=bar';
      fetchMock.post(
        runQueryEndpointWithParams,
        `{ "data": ${mockBigNumber} }`,
      );
      await makeRequest().then(() => {
        expect(fetchMock.calls(runQueryEndpointWithParams)).toHaveLength(1);
      });
    });
  });

  describe('reRunQuery', () => {
    it('creates new query with a new id', () => {
      const id = 'id';
      const state = {
        sqlLab: {
          tabHistory: [id],
          queryEditors: [{ id, name: 'Dummy query editor' }],
          unsavedQueryEditor: {},
        },
      };
      const store = mockStore(state);
      const request = actions.reRunQuery(query);
      request(store.dispatch, store.getState);
      expect(store.getActions()[0].query.id).toEqual('abcd');
    });
  });

  describe('postStopQuery', () => {
    const stopQueryEndpoint = 'glob:*/api/v1/query/stop';
    fetchMock.post(stopQueryEndpoint, {});
    const baseQuery = {
      ...query,
      id: 'test_foo',
    };

    const makeRequest = () => {
      const request = actions.postStopQuery(baseQuery);
      return request(dispatch);
    };

    it('makes the fetch request', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        expect(fetchMock.calls(stopQueryEndpoint)).toHaveLength(1);
      });
    });

    it('calls stopQuery', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        expect(dispatch.getCall(0).args[0].type).toBe(actions.STOP_QUERY);
      });
    });

    it('sends the correct data', () => {
      expect.assertions(1);

      return makeRequest().then(() => {
        const call = fetchMock.calls(stopQueryEndpoint)[0];
        const body = JSON.parse(call[1].body);
        expect(body.client_id).toBe(baseQuery.id);
      });
    });
  });

  describe('cloneQueryToNewTab', () => {
    it('creates new query editor', () => {
      expect.assertions(1);

      const id = 'id';
      const state = {
        sqlLab: {
          tabHistory: [id],
          queryEditors: [{ id, name: 'out of updated title' }],
          unsavedQueryEditor: {
            id,
            name: 'Dummy query editor',
          },
        },
      };
      const store = mockStore(state);
      const expectedActions = [
        {
          type: actions.ADD_QUERY_EDITOR,
          queryEditor: {
            name: 'Copy of Dummy query editor',
            dbId: 1,
            catalog: query.catalog,
            schema: query.schema,
            autorun: true,
            sql: 'SELECT * FROM something',
            queryLimit: undefined,
            maxRow: undefined,
            id: 'abcd',
            templateParams: undefined,
            inLocalStorage: true,
            loaded: true,
          },
        },
      ];
      const request = actions.cloneQueryToNewTab(query, true);
      request(store.dispatch, store.getState);

      expect(store.getActions()).toEqual(expectedActions);
    });
  });

  describe('popSavedQuery', () => {
    const supersetClientGetSpy = jest.spyOn(SupersetClient, 'get');
    const store = mockStore({});

    const mockSavedQueryApiResponse = {
      catalog: null,
      changed_by: {
        first_name: 'Superset',
        id: 1,
        last_name: 'Admin',
      },
      changed_on: '2024-12-28T20:06:14.246743',
      changed_on_delta_humanized: '8 days ago',
      created_by: {
        first_name: 'Superset',
        id: 1,
        last_name: 'Admin',
      },
      database: {
        database_name: 'examples',
        id: 2,
      },
      description: '',
      id: 1,
      label: 'Query 1',
      schema: 'public',
      sql: 'SELECT * FROM channels',
      sql_tables: [
        {
          catalog: null,
          schema: null,
          table: 'channels',
        },
      ],
      template_parameters: null,
    };

    const makeRequest = id => {
      const request = actions.popSavedQuery(id);
      const { dispatch } = store;

      return request(dispatch, () => initialState);
    };

    beforeEach(() => {
      supersetClientGetSpy.mockClear();
      store.clearActions();
    });

    afterAll(() => {
      supersetClientGetSpy.mockRestore();
    });

    it('calls API endpint with correct params', async () => {
      supersetClientGetSpy.mockResolvedValue({
        json: { result: mockSavedQueryApiResponse },
      });

      await makeRequest(123);

      expect(supersetClientGetSpy).toHaveBeenCalledWith({
        endpoint: '/api/v1/saved_query/123',
      });
    });

    it('dispatches addQueryEditor with correct params on successful API call', async () => {
      supersetClientGetSpy.mockResolvedValue({
        json: { result: mockSavedQueryApiResponse },
      });

      const expectedParams = {
        name: 'Query 1',
        dbId: 2,
        catalog: null,
        schema: 'public',
        sql: 'SELECT * FROM channels',
        templateParams: null,
        remoteId: 1,
      };

      await makeRequest(1);

      const addQueryEditorAction = store
        .getActions()
        .find(action => action.type === actions.ADD_QUERY_EDITOR);

      expect(addQueryEditorAction).toBeTruthy();
      expect(addQueryEditorAction?.queryEditor).toEqual(
        expect.objectContaining(expectedParams),
      );
    });

    it('should dispatch addDangerToast on API error', async () => {
      supersetClientGetSpy.mockResolvedValue(new Error());

      await makeRequest(1);

      const addToastAction = store
        .getActions()
        .find(action => action.type === ADD_TOAST);

      expect(addToastAction).toBeTruthy();
      expect(addToastAction?.payload?.toastType).toBe(ToastType.Danger);
    });
  });

  describe('addQueryEditor', () => {
    it('creates new query editor', () => {
      expect.assertions(1);

      const store = mockStore(initialState);
      const expectedActions = [
        {
          type: actions.ADD_QUERY_EDITOR,
          queryEditor: {
            ...queryEditor,
            inLocalStorage: true,
            loaded: true,
          },
        },
      ];
      store.dispatch(actions.addQueryEditor(defaultQueryEditor));

      expect(store.getActions()).toEqual(expectedActions);
    });

    describe('addNewQueryEditor', () => {
      it('creates new query editor with new tab name', () => {
        const store = mockStore({
          ...initialState,
          sqlLab: {
            ...initialState.sqlLab,
            unsavedQueryEditor: {
              id: defaultQueryEditor.id,
              name: 'Untitled Query 6',
            },
          },
        });
        const expectedActions = [
          {
            type: actions.ADD_QUERY_EDITOR,
            queryEditor: {
              id: 'abcd',
              sql: expect.stringContaining('SELECT ...'),
              name: `Untitled Query 7`,
              dbId: defaultQueryEditor.dbId,
              catalog: defaultQueryEditor.catalog,
              schema: defaultQueryEditor.schema,
              autorun: false,
              queryLimit:
                defaultQueryEditor.queryLimit ||
                initialState.common.conf.DEFAULT_SQLLAB_LIMIT,
              inLocalStorage: true,
              loaded: true,
            },
          },
        ];
        const request = actions.addNewQueryEditor();
        request(store.dispatch, store.getState);
        expect(store.getActions()).toEqual(expectedActions);
      });
    });
  });

  it('set current query editor', () => {
    expect.assertions(1);

    const store = mockStore(initialState);
    const expectedActions = [
      {
        type: actions.SET_ACTIVE_QUERY_EDITOR,
        queryEditor: defaultQueryEditor,
      },
    ];
    store.dispatch(actions.setActiveQueryEditor(defaultQueryEditor));

    expect(store.getActions()).toEqual(expectedActions);
  });

  describe('swithQueryEditor', () => {
    it('switch to the next tab editor', () => {
      const store = mockStore(initialState);
      const expectedActions = [
        {
          type: actions.SET_ACTIVE_QUERY_EDITOR,
          queryEditor: initialState.sqlLab.queryEditors[1],
        },
      ];
      store.dispatch(actions.switchQueryEditor());

      expect(store.getActions()).toEqual(expectedActions);
    });

    it('switch to the first tab editor once it reaches the rightmost tab', () => {
      const store = mockStore({
        ...initialState,
        sqlLab: {
          ...initialState.sqlLab,
          tabHistory: [
            initialState.sqlLab.queryEditors[
              initialState.sqlLab.queryEditors.length - 1
            ].id,
          ],
        },
      });
      const expectedActions = [
        {
          type: actions.SET_ACTIVE_QUERY_EDITOR,
          queryEditor: initialState.sqlLab.queryEditors[0],
        },
      ];
      store.dispatch(actions.switchQueryEditor());

      expect(store.getActions()).toEqual(expectedActions);
    });

    it('switch to the previous tab editor', () => {
      const store = mockStore({
        ...initialState,
        sqlLab: {
          ...initialState.sqlLab,
          tabHistory: [initialState.sqlLab.queryEditors[1].id],
        },
      });
      const expectedActions = [
        {
          type: actions.SET_ACTIVE_QUERY_EDITOR,
          queryEditor: initialState.sqlLab.queryEditors[0],
        },
      ];
      store.dispatch(actions.switchQueryEditor(true));

      expect(store.getActions()).toEqual(expectedActions);
    });

    it('switch to the last tab editor once it reaches the leftmost tab', () => {
      const store = mockStore({
        ...initialState,
        sqlLab: {
          ...initialState.sqlLab,
          tabHistory: [initialState.sqlLab.queryEditors[0].id],
        },
      });
      const expectedActions = [
        {
          type: actions.SET_ACTIVE_QUERY_EDITOR,
          queryEditor:
            initialState.sqlLab.queryEditors[
              initialState.sqlLab.queryEditors.length - 1
            ],
        },
      ];
      store.dispatch(actions.switchQueryEditor(true));

      expect(store.getActions()).toEqual(expectedActions);
    });
  });

  describe('backend sync', () => {
    const updateTabStateEndpoint = 'glob:*/tabstateview/*';
    fetchMock.put(updateTabStateEndpoint, {});
    fetchMock.delete(updateTabStateEndpoint, {});
    fetchMock.post(updateTabStateEndpoint, JSON.stringify({ id: 1 }));

    const updateTableSchemaEndpoint = 'glob:*/tableschemaview/*';
    fetchMock.put(updateTableSchemaEndpoint, {});
    fetchMock.delete(updateTableSchemaEndpoint, {});
    fetchMock.post(updateTableSchemaEndpoint, JSON.stringify({ id: 1 }));

    const getTableMetadataEndpoint =
      'glob:**/api/v1/database/*/table_metadata/*';
    fetchMock.get(getTableMetadataEndpoint, {});
    const getExtraTableMetadataEndpoint =
      'glob:**/api/v1/database/*/table_metadata/extra/*';
    fetchMock.get(getExtraTableMetadataEndpoint, {});

    beforeEach(() => {
      isFeatureEnabled.mockImplementation(
        feature => feature === 'SQLLAB_BACKEND_PERSISTENCE',
      );
    });

    afterEach(() => {
      isFeatureEnabled.mockRestore();
    });

    afterEach(fetchMock.resetHistory);

    describe('addQueryEditor', () => {
      it('creates the tab state in the local storage', () => {
        expect.assertions(2);

        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.ADD_QUERY_EDITOR,
            queryEditor: {
              ...queryEditor,
              id: 'abcd',
              loaded: true,
              inLocalStorage: true,
            },
          },
        ];
        store.dispatch(actions.addQueryEditor(queryEditor));

        expect(store.getActions()).toEqual(expectedActions);
        expect(fetchMock.calls(updateTabStateEndpoint)).toHaveLength(0);
      });
    });

    describe('removeQueryEditor', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(1);

        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.REMOVE_QUERY_EDITOR,
            queryEditor,
          },
        ];
        store.dispatch(actions.removeQueryEditor(queryEditor));
        expect(store.getActions()).toEqual(expectedActions);
      });
    });

    describe('queryEditorSetDb', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(1);

        const dbId = 42;
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.QUERY_EDITOR_SETDB,
            queryEditor,
            dbId,
          },
        ];
        store.dispatch(actions.queryEditorSetDb(queryEditor, dbId));
        expect(store.getActions()).toEqual(expectedActions);
      });
    });

    describe('queryEditorSetCatalog', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(1);

        const catalog = 'public';
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.QUERY_EDITOR_SET_CATALOG,
            queryEditor,
            catalog,
          },
        ];
        store.dispatch(actions.queryEditorSetCatalog(queryEditor, catalog));
        expect(store.getActions()).toEqual(expectedActions);
      });
    });

    describe('queryEditorSetSchema', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(1);

        const schema = 'schema';
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.QUERY_EDITOR_SET_SCHEMA,
            queryEditor,
            schema,
          },
        ];
        store.dispatch(actions.queryEditorSetSchema(queryEditor, schema));
        expect(store.getActions()).toEqual(expectedActions);
      });
    });

    describe('queryEditorSetAutorun', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(1);

        const autorun = true;
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.QUERY_EDITOR_SET_AUTORUN,
            queryEditor,
            autorun,
          },
        ];
        store.dispatch(actions.queryEditorSetAutorun(queryEditor, autorun));
        expect(store.getActions()).toEqual(expectedActions);
      });
    });

    describe('queryEditorSetTitle', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(1);

        const name = 'name';
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.QUERY_EDITOR_SET_TITLE,
            queryEditor,
            name,
          },
        ];
        store.dispatch(
          actions.queryEditorSetTitle(queryEditor, name, queryEditor.id),
        );
        expect(store.getActions()).toEqual(expectedActions);
      });
    });

    describe('queryEditorSetAndSaveSql', () => {
      const sql = 'SELECT * ';
      const expectedActions = [
        {
          type: actions.QUERY_EDITOR_SET_SQL,
          queryEditor,
          sql,
        },
      ];
      describe('with backend persistence flag on', () => {
        it('updates the tab state in the backend', () => {
          expect.assertions(2);

          const store = mockStore({
            ...initialState,
            sqlLab: {
              ...initialState.sqlLab,
              queryEditors: [queryEditor],
            },
          });
          const request = actions.queryEditorSetAndSaveSql(queryEditor, sql);
          return request(store.dispatch, store.getState).then(() => {
            expect(store.getActions()).toEqual(expectedActions);
            expect(fetchMock.calls(updateTabStateEndpoint)).toHaveLength(1);
          });
        });
      });
      describe('with backend persistence flag off', () => {
        it('does not update the tab state in the backend', () => {
          isFeatureEnabled.mockImplementation(
            feature => !(feature === 'SQLLAB_BACKEND_PERSISTENCE'),
          );

          const store = mockStore({
            ...initialState,
            sqlLab: {
              ...initialState.sqlLab,
              queryEditors: [queryEditor],
            },
          });
          const request = actions.queryEditorSetAndSaveSql(queryEditor, sql);
          request(store.dispatch, store.getState);

          expect(store.getActions()).toEqual(expectedActions);
          expect(fetchMock.calls(updateTabStateEndpoint)).toHaveLength(0);
          isFeatureEnabled.mockRestore();
        });
      });
    });

    describe('queryEditorSetQueryLimit', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(1);

        const queryLimit = 10;
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.QUERY_EDITOR_SET_QUERY_LIMIT,
            queryEditor,
            queryLimit,
          },
        ];
        store.dispatch(
          actions.queryEditorSetQueryLimit(queryEditor, queryLimit),
        );
        expect(store.getActions()).toEqual(expectedActions);
      });
    });

    describe('queryEditorSetTemplateParams', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(1);

        const templateParams = '{"foo": "bar"}';
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.QUERY_EDITOR_SET_TEMPLATE_PARAMS,
            queryEditor,
            templateParams,
          },
        ];
        store.dispatch(
          actions.queryEditorSetTemplateParams(queryEditor, templateParams),
        );

        expect(store.getActions()).toEqual(expectedActions);
      });
    });

    describe('addTable', () => {
      it('dispatches table state from unsaved change', () => {
        const tableName = 'table';
        const catalogName = null;
        const schemaName = 'schema';
        const expectedDbId = 473892;
        const store = mockStore({
          ...initialState,
          sqlLab: {
            ...initialState.sqlLab,
            unsavedQueryEditor: {
              id: query.id,
              dbId: expectedDbId,
            },
          },
        });
        const request = actions.addTable(
          query,
          tableName,
          catalogName,
          schemaName,
        );
        request(store.dispatch, store.getState);
        expect(store.getActions()[0]).toEqual(
          expect.objectContaining({
            table: expect.objectContaining({
              name: tableName,
              catalog: catalogName,
              schema: schemaName,
              dbId: expectedDbId,
            }),
          }),
        );
      });
    });

    describe('syncTable', () => {
      it('updates the table schema state in the backend', () => {
        expect.assertions(4);

        const tableName = 'table';
        const schemaName = 'schema';
        const store = mockStore(initialState);
        const expectedActionTypes = [
          actions.MERGE_TABLE, // syncTable
        ];
        const request = actions.syncTable(query, tableName, schemaName);
        return request(store.dispatch, store.getState).then(() => {
          expect(store.getActions().map(a => a.type)).toEqual(
            expectedActionTypes,
          );
          expect(store.getActions()[0].prepend).toBeFalsy();
          expect(fetchMock.calls(updateTableSchemaEndpoint)).toHaveLength(1);

          // tab state is not updated, since no query was run
          expect(fetchMock.calls(updateTabStateEndpoint)).toHaveLength(0);
        });
      });
    });

    describe('runTablePreviewQuery', () => {
      const results = {
        data: mockBigNumber,
        query: { sqlEditorId: 'null', dbId: 1 },
        query_id: 'efgh',
      };
      const tableName = 'table';
      const catalogName = null;
      const schemaName = 'schema';
      const store = mockStore({
        ...initialState,
        sqlLab: {
          ...initialState.sqlLab,
          databases: {
            1: { disable_data_preview: false },
          },
        },
      });

      beforeEach(() => {
        fetchMock.post(runQueryEndpoint, JSON.stringify(results), {
          overwriteRoutes: true,
        });
      });

      afterEach(() => {
        store.clearActions();
        fetchMock.resetHistory();
      });

      it('updates and runs data preview query when configured', () => {
        expect.assertions(3);

        const expectedActionTypes = [
          actions.MERGE_TABLE, // addTable (data preview)
          actions.START_QUERY, // runQuery (data preview)
          actions.QUERY_SUCCESS, // querySuccess
        ];
        const request = actions.runTablePreviewQuery({
          dbId: 1,
          name: tableName,
          catalog: catalogName,
          schema: schemaName,
        });
        return request(store.dispatch, store.getState).then(() => {
          expect(store.getActions().map(a => a.type)).toEqual(
            expectedActionTypes,
          );
          expect(fetchMock.calls(runQueryEndpoint)).toHaveLength(1);
          // tab state is not updated, since the query is a data preview
          expect(fetchMock.calls(updateTabStateEndpoint)).toHaveLength(0);
        });
      });

      it('runs data preview query only', () => {
        const expectedActionTypes = [
          actions.START_QUERY, // runQuery (data preview)
          actions.QUERY_SUCCESS, // querySuccess
        ];
        const request = actions.runTablePreviewQuery(
          {
            dbId: 1,
            name: tableName,
            catalog: catalogName,
            schema: schemaName,
          },
          true,
        );
        return request(store.dispatch, store.getState).then(() => {
          expect(store.getActions().map(a => a.type)).toEqual(
            expectedActionTypes,
          );
          expect(fetchMock.calls(runQueryEndpoint)).toHaveLength(1);
          // tab state is not updated, since the query is a data preview
          expect(fetchMock.calls(updateTabStateEndpoint)).toHaveLength(0);
        });
      });
    });

    describe('expandTable', () => {
      it('updates the table schema state in the backend', () => {
        expect.assertions(2);

        const table = { id: 1 };
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.EXPAND_TABLE,
            table,
          },
        ];
        return store.dispatch(actions.expandTable(table)).then(() => {
          expect(store.getActions()).toEqual(expectedActions);
          expect(fetchMock.calls(updateTableSchemaEndpoint)).toHaveLength(1);
        });
      });
    });

    describe('collapseTable', () => {
      it('updates the table schema state in the backend', () => {
        expect.assertions(2);

        const table = { id: 1 };
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.COLLAPSE_TABLE,
            table,
          },
        ];
        return store.dispatch(actions.collapseTable(table)).then(() => {
          expect(store.getActions()).toEqual(expectedActions);
          expect(fetchMock.calls(updateTableSchemaEndpoint)).toHaveLength(1);
        });
      });
    });

    describe('removeTables', () => {
      it('updates the table schema state in the backend', () => {
        expect.assertions(2);

        const table = { id: 1, initialized: true };
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.REMOVE_TABLES,
            tables: [table],
          },
        ];
        return store.dispatch(actions.removeTables([table])).then(() => {
          expect(store.getActions()).toEqual(expectedActions);
          expect(fetchMock.calls(updateTableSchemaEndpoint)).toHaveLength(1);
        });
      });

      it('deletes multiple tables and updates the table schema state in the backend', () => {
        expect.assertions(2);

        const tables = [
          { id: 1, initialized: true },
          { id: 2, initialized: true },
        ];
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.REMOVE_TABLES,
            tables,
          },
        ];
        return store.dispatch(actions.removeTables(tables)).then(() => {
          expect(store.getActions()).toEqual(expectedActions);
          expect(fetchMock.calls(updateTableSchemaEndpoint)).toHaveLength(2);
        });
      });

      it('only updates the initialized table schema state in the backend', () => {
        expect.assertions(2);

        const tables = [{ id: 1 }, { id: 2, initialized: true }];
        const store = mockStore({});
        const expectedActions = [
          {
            type: actions.REMOVE_TABLES,
            tables,
          },
        ];
        return store.dispatch(actions.removeTables(tables)).then(() => {
          expect(store.getActions()).toEqual(expectedActions);
          expect(fetchMock.calls(updateTableSchemaEndpoint)).toHaveLength(1);
        });
      });
    });

    describe('syncQueryEditor', () => {
      it('updates the tab state in the backend', () => {
        expect.assertions(3);

        const results = {
          data: mockBigNumber,
          query: { sqlEditorId: 'null' },
          query_id: 'efgh',
        };
        fetchMock.post(runQueryEndpoint, JSON.stringify(results), {
          overwriteRoutes: true,
        });

        const oldQueryEditor = { ...queryEditor, inLocalStorage: true };
        const tables = [
          {
            id: 'one',
            dataPreviewQueryId: 'previewOne',
            queryEditorId: oldQueryEditor.id,
            inLocalStorage: true,
          },
          {
            id: 'two',
            dataPreviewQueryId: 'previewTwo',
            queryEditorId: oldQueryEditor.id,
            inLocalStorage: true,
          },
        ];
        const queries = [
          {
            ...query,
            id: 'previewOne',
            sqlEditorId: oldQueryEditor.id,
            inLocalStorage: true,
          },
          {
            ...query,
            id: 'previewTwo',
            sqlEditorId: oldQueryEditor.id,
            inLocalStorage: true,
          },
        ];
        const store = mockStore({
          sqlLab: {
            queries,
            tables,
          },
        });
        const expectedActions = [
          {
            type: actions.MIGRATE_QUERY_EDITOR,
            oldQueryEditor,
            // new qe has a different id
            newQueryEditor: {
              ...oldQueryEditor,
              id: '1',
              inLocalStorage: false,
              loaded: true,
            },
          },
          {
            type: actions.MIGRATE_TAB_HISTORY,
            newId: '1',
            oldId: 'abcd',
          },
          {
            type: actions.MIGRATE_TABLE,
            oldTable: tables[0],
            // new table has a different id and points to new query editor
            newTable: { ...tables[0], id: 1, queryEditorId: '1' },
          },
          {
            type: actions.MIGRATE_TABLE,
            oldTable: tables[1],
            // new table has a different id and points to new query editor
            newTable: { ...tables[1], id: 1, queryEditorId: '1' },
          },
          {
            type: actions.MIGRATE_QUERY,
            queryId: 'previewOne',
            queryEditorId: '1',
          },
          {
            type: actions.MIGRATE_QUERY,
            queryId: 'previewTwo',
            queryEditorId: '1',
          },
        ];
        return store
          .dispatch(actions.syncQueryEditor(oldQueryEditor))
          .then(() => {
            expect(store.getActions()).toEqual(expectedActions);
            expect(fetchMock.calls(updateTabStateEndpoint)).toHaveLength(3);

            // query editor has 2 tables loaded in the schema viewer
            expect(fetchMock.calls(updateTableSchemaEndpoint)).toHaveLength(2);
          });
      });
    });
  });
});
