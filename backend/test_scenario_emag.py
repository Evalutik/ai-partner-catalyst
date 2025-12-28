from test_utils import run_test

def test_emag_laptop():
    # Scenario: looking for a laptop on emag
    run_test(
        "Emag Laptop",
        "looking for a laptop on emag",
        page_context={"url": "about:blank", "title": "New Tab", "width": 1920, "height": 1080}
    )

if __name__ == "__main__":
    test_emag_laptop()
