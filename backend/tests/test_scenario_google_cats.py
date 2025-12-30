from test_utils import run_test

def test_google_cats_switch():
    # Scenario: Search Google cats and switching tabs
    # This combines two intents. The agent might pick the first one or try to do a sequence.
    # The prompt was "searching google cats and switching tabs"
    run_test(
        "Google Cats & Switch Tab",
        "search google cats and switch tabs",
        page_context={"url": "about:blank", "title": "New Tab", "width": 1920, "height": 1080}
    )

if __name__ == "__main__":
    test_google_cats_switch()
